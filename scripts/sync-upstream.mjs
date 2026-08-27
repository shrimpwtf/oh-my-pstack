#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { forbiddenBindingsIn, isAllowedRuntimeBinding } from "./portability-bindings.mjs";

const root = resolve(
  process.env.PSTACK_SYNC_ROOT ?? dirname(fileURLToPath(import.meta.url)),
  process.env.PSTACK_SYNC_ROOT ? "." : "..",
);
const lockPath = join(root, "upstream.lock.json");
const boundaryLock = JSON.parse(readFileSync(lockPath, "utf8"));

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function normalizeContent(source) {
  return source
    .replaceAll("~/.cursor/rules/pstack-models.mdc", "$PSTACK_CONFIG (or .pstack/config.md)")
    .replaceAll("~/.cursor/skills/", "skills/")
    .replaceAll("~/.cursor/plugins/", "plugins/")
    .replaceAll(".cursor/skills/", "skills/")
    .replaceAll(".cursor/plugins/", "plugins/")
    .replaceAll("subagent_type:", "role:")
    .replaceAll("AskQuestion", "structured interaction tool")
    .replaceAll('environment: "cloud"', "environment: host-managed")
    .replaceAll("environment: 'cloud'", "environment: host-managed")
    .replaceAll("claude-fable-5-thinking-max", "host-configured role/model")
    .replaceAll("gpt-5.6-sol-max", "host-configured role/model")
    .replaceAll("grok-4.6-fast-xhigh", "host-configured role/model")
    .replaceAll("claude-opus-5-thinking-xhigh", "host-configured role/model")
    .replaceAll(/\bTask (?:subagent|tool)\b/g, "host task runner");
}

function isProtectedPathFor(lock, path) {
  return (
    lock.protectedPaths.includes(path) ||
    lock.protectedPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

export function isProtectedPath(path) {
  return isProtectedPathFor(boundaryLock, path);
}

async function filesUnder(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(directory);
  return files;
}

function parseArgs(argv) {
  const sourceIndex = argv.indexOf("--source");
  return {
    mode: argv.includes("--check") ? "check" : argv.includes("--apply") ? "apply" : argv.includes("--dry-run") ? "apply" : null,
    dryRun: argv.includes("--dry-run"),
    source: sourceIndex === -1 ? null : argv[sourceIndex + 1],
  };
}

async function sourceRepository(lock, sourceArg) {
  if (sourceArg) return { path: resolve(sourceArg), cleanup: null };
  const path = await mkdtemp(join(tmpdir(), "pstack-upstream-"));
  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--branch", lock.ref, lock.repository, path],
      { stdio: "inherit" },
    );
    try {
      execFileSync(
        "git",
        ["fetch", "--quiet", "--depth", "1", "origin", lock.commit],
        { cwd: path },
      );
    } catch {
      // A missing baseline makes protected-file review fail closed.
    }
    return { path, cleanup: path };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

async function protectedChanges(lock, sourceRoot, commit) {
  const sourceRoots = lock.sourceRoots.map((mapping) => mapping.source);
  let changedSources;
  try {
    changedSources = git(
      ["diff", "--name-only", "--diff-filter=ACDMRTUXB", lock.commit, commit, "--", ...sourceRoots],
      sourceRoot,
    ).split("\n").filter(Boolean);
  } catch {
    return [
      ...lock.protectedPaths.map((path) => `${path} (baseline unavailable at ${commit})`),
      ...lock.protectedPrefixes.map((path) => `${path} (baseline unavailable at ${commit})`),
    ];
  }

  const changes = new Set();
  for (const sourcePath of changedSources) {
    for (const mapping of lock.sourceRoots) {
      const prefix = `${mapping.source}/`;
      if (!sourcePath.startsWith(prefix)) continue;
      const destination = `${mapping.destination}/${sourcePath.slice(prefix.length)}`;
      if (isProtectedPathFor(lock, destination)) changes.add(destination);
    }
  }
  return [...changes].sort();
}

async function managedSnapshot(lock, sourceRoot) {
  const snapshot = new Map();
  for (const mapping of lock.sourceRoots) {
    const sourceDirectory = join(sourceRoot, mapping.source);
    for (const sourceFile of await filesUnder(sourceDirectory)) {
      const destinationKey = join(
        mapping.destination,
        relative(sourceDirectory, sourceFile),
      );
      snapshot.set(destinationKey, normalizeContent(await readFile(sourceFile, "utf8")));
    }
  }
  return snapshot;
}

async function localManagedPaths(lock) {
  const paths = new Set();
  for (const mapping of lock.sourceRoots) {
    const destinationDirectory = join(root, mapping.destination);
    let files;
    try {
      files = await filesUnder(destinationDirectory);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    for (const path of files) paths.add(relative(root, path));
  }
  return paths;
}

export function portabilityViolations(lock, snapshot) {
  const violations = [];
  for (const [destinationKey, source] of snapshot) {
    if (isProtectedPathFor(lock, destinationKey)) continue;
    for (const binding of forbiddenBindingsIn(source)) {
      if (!isAllowedRuntimeBinding(destinationKey, binding)) {
        violations.push(`${destinationKey}: ${binding}`);
      }
    }
  }
  return violations;
}

async function managedDrift(lock, snapshot) {
  const drift = [];
  for (const [destinationKey, next] of snapshot) {
    if (isProtectedPathFor(lock, destinationKey)) continue;
    try {
      if (await readFile(join(root, destinationKey), "utf8") !== next) drift.push(destinationKey);
    } catch {
      drift.push(destinationKey);
    }
  }
  for (const destinationKey of await localManagedPaths(lock)) {
    if (!snapshot.has(destinationKey) && !isProtectedPathFor(lock, destinationKey)) {
      drift.push(`${destinationKey} (stale)`);
    }
  }
  return [...new Set(drift)].sort();
}

async function applyUpdate(lock, sourceRoot, commit, dryRun) {
  const conflicts = await protectedChanges(lock, sourceRoot, commit);
  if (conflicts.length > 0) {
    console.error("Upstream changed protected OMP-adapted files:");
    for (const path of conflicts) console.error(`- ${path}`);
    console.error("Review and merge those files manually before rerunning --apply.");
    return 2;
  }

  const snapshot = await managedSnapshot(lock, sourceRoot);
  const violations = portabilityViolations(lock, snapshot);
  if (violations.length > 0) {
    console.error("Upstream files require a portable adapter before sync:");
    for (const violation of violations) console.error(`- ${violation}`);
    return 3;
  }

  const changed = [];
  for (const [destinationKey, next] of snapshot) {
    if (isProtectedPathFor(lock, destinationKey)) continue;
    const destination = join(root, destinationKey);
    let current = null;
    try {
      current = await readFile(destination, "utf8");
    } catch {
      current = null;
    }
    if (current === next) continue;
    changed.push(destinationKey);
    if (!dryRun) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, next);
    }
  }

  for (const destinationKey of await localManagedPaths(lock)) {
    if (snapshot.has(destinationKey) || isProtectedPathFor(lock, destinationKey)) continue;
    changed.push(destinationKey);
    if (!dryRun) await rm(join(root, destinationKey), { force: true });
  }

  if (changed.length === 0) {
    console.log(`No managed skill changes for upstream ${commit}.`);
    if (!dryRun) {
      await writeFile(
        lockPath,
        `${JSON.stringify({ ...lock, commit }, null, 2)}\n`,
      );
    }
    return 0;
  }
  console.log(`${dryRun ? "Would update" : "Updated"} ${changed.length} managed files:`);
  for (const path of changed) console.log(`- ${path}`);
  if (!dryRun) {
    await writeFile(
      lockPath,
      `${JSON.stringify({ ...lock, commit }, null, 2)}\n`,
    );
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.mode || (args.source !== null && !args.source)) {
    console.error("Usage: sync-upstream.mjs --check [--source DIR]");
    console.error("       sync-upstream.mjs --apply [--dry-run] [--source DIR]");
    return 64;
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const source = await sourceRepository(lock, args.source);
  try {
    const commit = git(["rev-parse", "HEAD"], source.path);
    console.log(`pinned=${lock.commit}`);
    console.log(`latest=${commit}`);
    const snapshot = await managedSnapshot(lock, source.path);
    const violations = portabilityViolations(lock, snapshot);
    if (commit === lock.commit) {
      const drift = await managedDrift(lock, snapshot);
      if (violations.length === 0 && drift.length === 0) {
        console.log("Upstream pin and managed files match the latest checked revision.");
        return 0;
      }
      if (violations.length > 0) {
        console.error("Pinned upstream files contain unsupported runtime bindings:");
        for (const violation of violations) console.error(`- ${violation}`);
      }
      if (drift.length > 0) {
        console.error("Managed files differ from the pinned upstream revision:");
        for (const path of drift) console.error(`- ${path}`);
      }
      return 11;
    }
    if (args.mode === "check") {
      if (violations.length > 0) {
        console.error("Latest upstream files require a portable adapter:");
        for (const violation of violations) console.error(`- ${violation}`);
      }
      return 10;
    }
    return await applyUpdate(lock, source.path, commit, args.dryRun);
  } finally {
    if (source.cleanup) await rm(source.cleanup, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
