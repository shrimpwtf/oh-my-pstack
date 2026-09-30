import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 360_000,
    }).trim();
  } catch (error) {
    const detail = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`, {
      cause: error,
    });
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function readJsonl(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function isWithin(root, candidate) {
  const path = resolve(root, candidate);
  const relativePath = relative(resolve(root), path);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !relativePath.startsWith("../") &&
    !relativePath.startsWith("..\\")
  );
}

function toolPaths(entries) {
  const paths = { read: [], edit: [], write: [] };
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "toolResult") continue;
    const { toolName, details } = entry.message;
    if (toolName === "read" && details?.meta?.source?.value) {
      paths.read.push(details.meta.source.value);
    } else if (toolName === "edit" && details?.path) {
      paths.edit.push(details.path);
    } else if (toolName === "write" && details?.resolvedPath) {
      paths.write.push(details.resolvedPath);
    }
  }
  return paths;
}

function gitRootEvidence(entries) {
  const result = entries.find((entry) => entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "bash");
  const output = result?.message.content?.map((block) => block.text ?? "").join("\n") ?? "";
  const [cwd, gitRoot] = output.split(/\r?\n/u).filter((line) => line.trim());
  assert.ok(cwd && gitRoot, "Child bash did not report pwd and Git root");
  return { cwd, gitRoot };
}

function childPrompt(name, source, changed, artifact, artifactContent) {
  return [
    `In your OMP-isolated workspace, edit only src/${source} and ${artifact}.`,
    "First run bash to print pwd, git rev-parse --show-toplevel, and git status --short --branch.",
    `Read relative src/${source}. Use its exact hashline tag to replace BASE ${name} with ${changed}.`,
    `Write relative ${artifact} with exactly ${artifactContent}.`,
    `Finally run git status --short --branch and git diff -- src/${source}. Do not call task or use absolute paths.`,
  ].join(" ");
}

function parentPrompt() {
  const tasks = [
    {
      name: "IsoWriterA",
      agent: "task",
      isolated: true,
      solutionSpace: "one fixed source-file edit",
      task: childPrompt("A", "a.txt", "ISOLATED A", "artifact-a.txt", "ARTIFACT A"),
    },
    {
      name: "IsoWriterB",
      agent: "task",
      isolated: true,
      solutionSpace: "one fixed source-file edit",
      task: childPrompt("B", "b.txt", "ISOLATED B", "artifact-b.txt", "ARTIFACT B"),
    },
  ];
  return [
    "Call task exactly once using batch mode. Do not use any other tool yourself or add a tools field.",
    "The config sets async.enabled=false, task.isolation.enabled=true, task.isolation.apply=false, and task.isolation.merge=patch.",
    JSON.stringify({
      context: "Two disjoint fixture files in a committed disposable repository. Each child owns only its assigned source and artifact.",
      tasks,
    }),
    "Report only task results and patch artifacts actually returned.",
  ].join("\n");
}

async function main() {
  const model = process.env.PSTACK_OMP_SMOKE_MODEL?.trim();
  if (!model) throw new Error("Set PSTACK_OMP_SMOKE_MODEL to a configured OMP model selector.");

  const ompVersion = run("omp", ["--version"]);
  assert.match(ompVersion, /18\.4\.2/u, `Expected OMP 18.4.2, got ${ompVersion}`);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "pstack-omp-isolation-smoke-"));
  let succeeded = false;
  try {
    const repository = join(temporaryRoot, "repo");
    const sessions = join(temporaryRoot, "sessions");
    const workspaces = join(temporaryRoot, "workspaces");
    const configPath = join(temporaryRoot, "config.yml");
    await Promise.all([
      mkdir(join(repository, "src"), { recursive: true }),
      mkdir(sessions, { recursive: true }),
      mkdir(workspaces, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(repository, "src", "a.txt"), "BASE A\n"),
      writeFile(join(repository, "src", "b.txt"), "BASE B\n"),
    ]);

    run("git", ["init", "--quiet"], repository);
    run("git", ["config", "user.name", "OMP isolation smoke"], repository);
    run("git", ["config", "user.email", "omp-isolation-smoke@example.invalid"], repository);
    run("git", ["add", "src/a.txt", "src/b.txt"], repository);
    run("git", ["commit", "--quiet", "-m", "smoke baseline"], repository);
    const baselineHead = run("git", ["rev-parse", "HEAD"], repository);
    const config = [
      "async:",
      "  enabled: false",
      "task:",
      "  isolation:",
      "    enabled: true",
      "    apply: false",
      "    merge: patch",
      "  batch: true",
      "  maxConcurrency: 2",
      "isolation:",
      "  backend: rcopy",
      "worktree:",
      `  base: ${JSON.stringify(workspaces)}`,
      "",
    ].join("\n");
    await writeFile(configPath, config);

    run("omp", [
      "--session-dir", sessions,
      "--cwd", repository,
      "--config", configPath,
      "--model", model,
      "--mode", "json",
      "--print",
      "--no-title",
      "--no-extensions",
      "--no-skills",
      "--no-rules",
      "--tools=task",
      "--approval-mode=yolo",
      "--max-time", "360",
      parentPrompt(),
    ], repository);

    const gitStatus = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], repository);
    const finalHead = run("git", ["rev-parse", "HEAD"], repository);
    assert.equal(gitStatus, "", `Parent checkout changed: ${gitStatus}`);
    assert.equal(finalHead, baselineHead, "Parent HEAD changed during isolated Task execution");
    assert.equal(await readFile(join(repository, "src", "a.txt"), "utf8"), "BASE A\n");
    assert.equal(await readFile(join(repository, "src", "b.txt"), "utf8"), "BASE B\n");

    const files = await walk(sessions);
    const parentLogs = files.filter((path) => dirname(path) === sessions && extname(path) === ".jsonl");
    assert.equal(parentLogs.length, 1, `Expected one parent session JSONL, found ${parentLogs.length}`);
    const parentLog = parentLogs[0];
    const parentName = basename(parentLog);
    const childLogs = files.filter((path) => extname(path) === ".jsonl" && dirname(path) !== sessions);
    const children = [];
    for (const path of childLogs) {
      const entries = await readJsonl(path);
      const header = entries.find((entry) => entry.type === "session");
      if (basename(header?.parentSession ?? "") !== parentName) continue;
      children.push({ path, entries, header });
    }
    assert.equal(children.length, 2, `Expected two child session logs, found ${children.length}`);

    const expectations = [
      { name: "IsoWriterA", source: "a.txt", changed: "ISOLATED A", artifact: "artifact-a.txt", content: "ARTIFACT A" },
      { name: "IsoWriterB", source: "b.txt", changed: "ISOLATED B", artifact: "artifact-b.txt", content: "ARTIFACT B" },
    ];
    const isolatedRoots = new Set();
    for (const expected of expectations) {
      const child = children.find(({ path }) => basename(path) === `${expected.name}.jsonl`);
      assert.ok(child, `Missing persisted session for ${expected.name}`);
      assert.ok(child.header.cwd, `${expected.name} session has no cwd`);
      const roots = gitRootEvidence(child.entries);
      assert.notEqual(resolve(child.header.cwd), resolve(repository), `${expected.name} did not get a separate cwd`);
      assert.ok(isWithin(workspaces, child.header.cwd), `${expected.name} cwd is outside configured workspaces`);
      assert.equal(resolve(roots.cwd), resolve(child.header.cwd), `${expected.name} pwd differs from session cwd`);
      const relativeRoot = relative(workspaces, child.header.cwd);
      assert.ok(relativeRoot && relativeRoot !== ".." && !relativeRoot.startsWith(`..${sep}`), `${expected.name} cwd is not under configured workspaces`);
      const gitRootSuffix = relativeRoot.split(sep).join("/");
      const gitRootPath = roots.gitRoot.split(sep).join("/");
      assert.ok(gitRootPath.endsWith(gitRootSuffix), `${expected.name} Git root does not match its isolated workspace`);
      const gitRootBase = roots.gitRoot.slice(0, roots.gitRoot.length - relativeRoot.length - 1);
      assert.equal(await realpath(gitRootBase), await realpath(workspaces), `${expected.name} Git root resolves outside configured workspaces`);
      isolatedRoots.add(resolve(child.header.cwd));

      const paths = toolPaths(child.entries);
      assert.ok(paths.read.some((path) => path.endsWith(join("src", expected.source)) && isWithin(child.header.cwd, path)), `${expected.name} relative read escaped its root`);
      assert.ok(paths.edit.some((path) => path.endsWith(join("src", expected.source)) && isWithin(child.header.cwd, path)), `${expected.name} relative edit escaped its root`);
      assert.ok(paths.write.some((path) => path.endsWith(expected.artifact) && isWithin(child.header.cwd, path)), `${expected.name} relative write escaped its root`);

      const patchPath = join(dirname(parentLog), basename(parentLog, extname(parentLog)), `${expected.name}.patch`);
      const patch = await readFile(patchPath, "utf8");
      assert.ok(patch.includes(expected.changed), `${expected.name} patch omitted the source edit`);
      assert.ok(patch.includes(expected.content), `${expected.name} patch omitted the artifact`);
      assert.ok(patch.includes(expected.source), `${expected.name} patch omitted the assigned source path`);
      for (const other of expectations.filter(({ name }) => name !== expected.name)) {
        assert.ok(!patch.includes(other.source), `${expected.name} patch includes ${other.source}`);
        assert.ok(!patch.includes(other.artifact), `${expected.name} patch includes ${other.artifact}`);
      }
    }
    assert.equal(isolatedRoots.size, 2, "Isolated writers shared one execution root");

    console.log(JSON.stringify({
      ompVersion,
      baselineHead,
      parentStatus: "clean",
      merge: "patch",
      apply: false,
      isolatedRoots: [...isolatedRoots],
      patches: expectations.map(({ name }) => `${name}.patch`),
    }, null, 2));
    succeeded = true;
  } finally {
    if (succeeded) await rm(temporaryRoot, { recursive: true, force: true });
    else console.error(`OMP isolation smoke artifacts retained at ${temporaryRoot}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
