import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { isProtectedPath, normalizeContent } from "./sync-upstream.mjs";

test("normalization removes the supported Cursor runtime bindings", () => {
  const source = [
    "config: ~/.cursor/rules/pstack-models.mdc",
    "agent: Task subagent",
    "question: AskQuestion",
    "model: claude-fable-5-thinking-max",
    "model: claude-fable-5-1-thinking-max",
  ].join("\n");

  const normalized = normalizeContent(source);

  assert.doesNotMatch(normalized, /~\/\.cursor\/|AskQuestion|claude-fable/u);
  assert.match(normalized, /\$PSTACK_CONFIG/u);
  assert.match(normalized, /host task runner/u);
});

test("protected paths remain outside automatic upstream ownership", () => {
  assert.equal(isProtectedPath("skills/poteto-mode/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/pstack-pi/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/how/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/arena/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/why/references/sources/slack.md"), false);
});

test("apply updates an upstream-owned file and advances the lock", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(
      join(source, "pstack/automations/benny/skills/setup-benny"),
      { recursive: true },
    );
    await mkdir(join(target, "skills"), { recursive: true });
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: source\n---\nagent: Task subagent\n",
    );
    await writeFile(
      join(source, "pstack/automations/benny/skills/setup-benny/SKILL.md"),
      "---\nname: setup-benny\ndescription: protected\n---\n",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: updated\n---\nagent: Task subagent\n",
    );
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "update"], { cwd: source });
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: [],
        protectedPaths: ["skills/setup-benny/SKILL.md"],
        sourceRoots: [
          { source: "pstack/skills", destination: "skills" },
          { source: "pstack/automations/benny/skills", destination: "skills" },
        ],
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target } },
    );

    const synced = await readFile(
      join(target, "skills/blast-radius/SKILL.md"),
      "utf8",
    );
    assert.match(synced, /host task runner/u);
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(lock.commit, execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source, encoding: "utf8",
    }).trim());
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

for (const change of ["prefix edit", "prefix addition", "protected deletion", "missing baseline", "dirty protected edit", "untracked addition"]) {
  test(`apply rejects ${change} without changing target files or lock`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-protected-test-"));
    const source = join(fixture, "source");
    const target = join(fixture, "target");
    const protectedPath = "skills/private/SKILL.md";
    const managedPath = "skills/public/SKILL.md";
    const git = (...args) => execFileSync("git", args, {
      cwd: source, encoding: "utf8",
    }).trim();
    try {
      for (const path of [protectedPath, managedPath]) {
        for (const directory of [source, target]) {
          const file = join(directory, directory === source ? "pstack" : ".", path);
          await mkdir(join(file, ".."), { recursive: true });
          await writeFile(file, "baseline content\n");
        }
      }
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "pstack test");
      git("add", ".");
      git("commit", "-q", "-m", "baseline");
      const baseline = git("rev-parse", "HEAD");
      await writeFile(join(source, "pstack", managedPath), "updated managed content\n");
      if (change === "prefix edit") {
        await writeFile(join(source, "pstack", protectedPath), "updated protected content\n");
      } else if (change === "prefix addition") {
        await writeFile(join(source, "pstack/skills/private/new.md"), "new protected content\n");
      } else if (change === "protected deletion") {
        await rm(join(source, "pstack", protectedPath));
      }
      git("add", ".");
      git("commit", "-q", "-m", "update");
      if (change === "dirty protected edit") {
        await writeFile(join(source, "pstack", protectedPath), "uncommitted content\n");
      } else if (change === "untracked addition") {
        await writeFile(join(source, "pstack/skills/public/new.md"), "untracked content\n");
      }
      const originalLock = `${JSON.stringify({
        repository: "local",
        ref: "main",
        commit: change === "missing baseline" ? "0".repeat(40) : baseline,
        protectedPrefixes: change === "protected deletion" ? [] : ["skills/private/"],
        protectedPaths: change === "protected deletion" ? [protectedPath] : [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`;
      await writeFile(join(target, "upstream.lock.json"), originalLock);

      const result = spawnSync(process.execPath, [
        join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source,
      ], { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" });

      assert.equal(result.status, 2, result.stderr);
      const expectedError = change === "missing baseline"
        ? /baseline.*unavailable/u
        : change === "dirty protected edit" || change === "untracked addition"
          ? /source has uncommitted changes/u
          : /skills\/private\//u;
      assert.match(result.stderr, expectedError);
      assert.equal(await readFile(join(target, "upstream.lock.json"), "utf8"), originalLock);
      for (const path of [protectedPath, managedPath]) {
        assert.equal(await readFile(join(target, path), "utf8"), "baseline content\n");
      }
      if (change === "prefix addition") {
        await assert.rejects(readFile(join(target, "skills/private/new.md")), { code: "ENOENT" });
      }
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
