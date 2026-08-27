import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { forbiddenBindingsIn, forbiddenRuntimeBindings } from "./portability-bindings.mjs";
import { isProtectedPath, normalizeContent, portabilityViolations } from "./sync-upstream.mjs";

test("normalization removes the supported Cursor runtime bindings", () => {
  const source = [
    "config: ~/.cursor/rules/pstack-models.mdc",
    "agent: Task subagent",
    "question: AskQuestion",
    "model: claude-fable-5-thinking-max",
  ].join("\n");

  const normalized = normalizeContent(source);

  assert.doesNotMatch(normalized, /~\/\.cursor\/|AskQuestion|claude-fable/u);
  assert.match(normalized, /\$PSTACK_CONFIG/u);
  assert.match(normalized, /host task runner/u);
});

test("normalization removes absolute Cursor skill and plugin roots without leaving home-relative paths", () => {
  const normalized = normalizeContent([
    "~/.cursor/skills/example/SKILL.md",
    "~/.cursor/plugins/example/plugin.json",
  ].join("\n"));

  assert.equal(normalized, "skills/example/SKILL.md\nplugins/example/plugin.json");
  assert.doesNotMatch(normalized, /~\/skills|~\/plugins/u);
});

test("the updater normalizes or blocks every forbidden runtime binding", () => {
  const lock = { protectedPaths: [], protectedPrefixes: [] };
  for (const binding of forbiddenRuntimeBindings) {
    const normalized = normalizeContent(binding);
    const remaining = forbiddenBindingsIn(normalized);
    const violations = portabilityViolations(lock, new Map([["skills/example/SKILL.md", normalized]]));
    assert.deepEqual(violations, remaining.map((token) => `skills/example/SKILL.md: ${token}`));
    assert.equal(normalized !== binding || violations.length > 0, true, binding);
  }
});

test("protected paths remain outside automatic upstream ownership", () => {
  assert.equal(isProtectedPath("skills/poteto-mode/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/pstack-pi/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/how/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/arena/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/why/references/sources/slack.md"), false);
});

test("a changed file under a protected prefix blocks the update", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-protected-prefix-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    const sourceSkill = join(source, "pstack/skills/poteto-mode/SKILL.md");
    const targetSkill = join(target, "skills/poteto-mode/SKILL.md");
    await mkdir(join(source, "pstack/skills/poteto-mode"), { recursive: true });
    await mkdir(join(target, "skills/poteto-mode"), { recursive: true });
    await writeFile(sourceSkill, "upstream baseline\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(sourceSkill, "upstream changed\n");
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "change protected skill"], { cwd: source });
    await writeFile(targetSkill, "portable adaptation\n");
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: ["skills/poteto-mode/"],
        protectedPaths: [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`,
    );

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /skills\/poteto-mode\/SKILL\.md/u);
    assert.equal(await readFile(targetSkill, "utf8"), "portable adaptation\n");
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(lock.commit, baseline);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("apply advances the lock when the new commit has no managed changes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-empty-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    const sourceSkill = join(source, "pstack/skills/blast-radius/SKILL.md");
    const targetSkill = join(target, "skills/blast-radius/SKILL.md");
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(join(target, "skills/blast-radius"), { recursive: true });
    await writeFile(sourceSkill, "portable content\n");
    await writeFile(targetSkill, "portable content\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(join(source, "README.md"), "outside managed roots\n");
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "outside update"], { cwd: source });
    const latest = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: [],
        protectedPaths: [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target } },
    );

    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(lock.commit, latest);
    assert.equal(await readFile(targetSkill, "utf8"), "portable content\n");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("apply removes an upstream-owned file deleted after the baseline", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-delete-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    const sourceSkill = join(source, "pstack/skills/removed/SKILL.md");
    const targetSkill = join(target, "skills/removed/SKILL.md");
    await mkdir(join(source, "pstack/skills/removed"), { recursive: true });
    await mkdir(join(target, "skills/removed"), { recursive: true });
    await writeFile(sourceSkill, "removed upstream\n");
    await writeFile(targetSkill, "removed upstream\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await rm(sourceSkill);
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "remove managed skill"], { cwd: source });
    const latest = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: [],
        protectedPaths: [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target } },
    );

    await assert.rejects(readFile(targetSkill, "utf8"), /ENOENT/u);
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(lock.commit, latest);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
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
    assert.notEqual(lock.commit, "0".repeat(40));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("check rejects local drift from the pinned upstream revision", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-drift-check-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    const sourceSkill = join(source, "pstack/skills/blast-radius/SKILL.md");
    const targetSkill = join(target, "skills/blast-radius/SKILL.md");
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(join(target, "skills/blast-radius"), { recursive: true });
    await writeFile(sourceSkill, "pinned content\n");
    await writeFile(targetSkill, "corrupt content\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "pinned"], { cwd: source });
    const pinned = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: pinned,
        protectedPrefixes: [],
        protectedPaths: [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`,
    );

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--check", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" },
    );

    assert.equal(result.status, 11);
    assert.match(result.stderr, /Managed files differ/u);
    assert.match(result.stderr, /skills\/blast-radius\/SKILL\.md/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("apply quarantines a new skill with unsupported runtime bindings", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-quarantine-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    const safeSkill = join(source, "pstack/skills/blast-radius/SKILL.md");
    const blockedSkill = join(source, "pstack/skills/grokbot/SKILL.md");
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(join(target, "skills/blast-radius"), { recursive: true });
    await writeFile(safeSkill, "portable content\n");
    await writeFile(join(target, "skills/blast-radius/SKILL.md"), "portable content\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await mkdir(join(source, "pstack/skills/grokbot"), { recursive: true });
    await writeFile(blockedSkill, "Call SendToUser with type secret-request.\n");
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "add cursor skill"], { cwd: source });
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: [],
        protectedPaths: [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`,
    );

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" },
    );

    assert.equal(result.status, 3);
    assert.match(result.stderr, /require a portable adapter/u);
    await assert.rejects(readFile(join(target, "skills/grokbot/SKILL.md"), "utf8"), /ENOENT/u);
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(lock.commit, baseline);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
