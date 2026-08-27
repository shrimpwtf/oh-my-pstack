import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { forbiddenRuntimeBindings, isAllowedRuntimeBinding } from "./portability-bindings.mjs";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const requiredSkills = new Set([
  "architect",
  "arena",
  "automate-me",
  "blast-radius",
  "bro",
  "create-skill",
  "create-verification-skill",
  "figure-it-out",
  "how",
  "interrogate",
  "maintain-verification-skill",
  "no-comments",
  "poteto-mode",
  "pstack-pi",
  "recall",
  "reflect",
  "setup-pstack",
  "show-me-your-work",
  "swarm",
  "tdd",
  "teach",
  "technical-writing",
  "typescript-best-practices",
  "unslop",
  "why",
  "reproduce-and-fix-issues",
  "setup-benny",
  "triage-issue-reports",
  "principle-boundary-discipline",
  "principle-build-the-lever",
  "principle-encode-lessons-in-structure",
  "principle-exhaust-the-design-space",
  "principle-experience-first",
  "principle-fix-root-causes",
  "principle-foundational-thinking",
  "principle-guard-the-context-window",
  "principle-laziness-protocol",
  "principle-make-operations-idempotent",
  "principle-migrate-callers-then-delete-legacy-apis",
  "principle-minimize-reader-load",
  "principle-model-the-domain",
  "principle-never-block-on-the-human",
  "principle-outcome-oriented-execution",
  "principle-prove-it-works",
  "principle-redesign-from-first-principles",
  "principle-separate-before-serializing-shared-state",
  "principle-sequence-verifiable-units",
  "principle-subtract-before-you-add",
  "principle-type-system-discipline",
]);

const failures = [];
const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const knownSkillNames = new Set(skillDirs);
for (const directory of skillDirs) {
  try {
    const source = await readFile(join(skillsRoot, directory, "SKILL.md"), "utf8");
    const name = source.match(/^name:\s*([^\n]+)$/mu)?.[1]?.trim();
    if (name) knownSkillNames.add(name);
  } catch {
    continue;
  }
}

for (const name of requiredSkills) {
  const path = join(skillsRoot, name, "SKILL.md");
  try {
    const source = await readFile(path, "utf8");
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
    if (!/^name:\s*\S+/mu.test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter name`);
    }
    if (!/^description:\s*\S+/mu.test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter description`);
    }
  } catch {
    failures.push(`missing ${relative(root, path)}`);
  }
}

const markdownFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith(".md")) markdownFiles.push(path);
  }
};
await collect(skillsRoot);

function proseOutsideCodeFences(source) {
  let inFence = false;
  return source.split("\n").map((line) => {
    if (/^\s*(?:`{3,}|~{3,})/u.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  }).join("\n");
}

for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  const prose = proseOutsideCodeFences(source);
  for (const match of prose.matchAll(/\*\*([a-z0-9-]+)\*\*\s+(?:skill|guidance|workflow)\b/giu)) {
    const dependency = match[1]?.toLowerCase();
    if (dependency && !knownSkillNames.has(dependency)) {
      failures.push(`${relative(root, path)} references missing skill ${dependency}`);
    }
  }
  for (const match of prose.matchAll(/\]\(([^)#][^)]*)\)/gu)) {
    const target = match[1].split("#", 1)[0];
    if (target === "" || /^[a-z]+[0-9]*$/u.test(target)) continue;
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("skill://")
    ) continue;
    const targetPath = resolve(path, "..", target);
    try {
      await stat(targetPath);
    } catch {
      failures.push(`${relative(root, path)} references missing ${target}`);
    }
  }
}

for (const path of [
  join(root, "package.json"),
  join(root, ".claude-plugin", "plugin.json"),
  join(root, ".codex-plugin", "plugin.json"),
  join(root, "upstream.lock.json"),
]) {
  try {
    JSON.parse(await readFile(path, "utf8"));
  } catch {
    failures.push(`${relative(root, path)} is not valid JSON`);
  }
}

try {
  const packageManifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  );
  const requiredKeywords = [
    "pi-package",
    "pstack",
    "agent-skills",
    "coding-agent",
    "claude-code",
    "codex",
  ];
  if (packageManifest.name !== "pstack-pi") {
    failures.push("package.json does not use the pstack-pi package name");
  }
  if (!packageManifest.pi?.skills?.includes("./skills")) {
    failures.push("package.json does not expose ./skills through the pi manifest");
  }
  if (!packageManifest.pi?.extensions?.includes("./extensions/pstack-router/index.ts")) {
    failures.push("package.json does not expose the deterministic pstack router extension");
  }
  if (!packageManifest.pi?.subagents?.agents?.includes("./agents")) {
    failures.push("package.json does not expose the bundled pstack agents to pi-subagents");
  }
  if (packageManifest.peerDependencies?.["@earendil-works/pi-coding-agent"] === undefined) {
    failures.push("package.json does not declare the Pi host peer dependency");
  }
  if (requiredKeywords.some((keyword) => !packageManifest.keywords?.includes(keyword))) {
    failures.push("package.json is missing discoverability keywords");
  }
  const claudeManifest = JSON.parse(
    await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8")
  );
  if (claudeManifest.name !== "pstack-pi") {
    failures.push(".claude-plugin/plugin.json does not use the pstack-pi name");
  }
  if (claudeManifest.version !== packageManifest.version) {
    failures.push(".claude-plugin/plugin.json version differs from package.json");
  }
  const codexManifest = JSON.parse(
    await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8")
  );
  if (codexManifest.name !== "pstack-pi" || codexManifest.skills !== "./skills/") {
    failures.push(".codex-plugin/plugin.json has incorrect package identity or skills path");
  }
  if (codexManifest.version !== packageManifest.version) {
    failures.push(".codex-plugin/plugin.json version differs from package.json");
  }
  const upstreamLock = JSON.parse(
    await readFile(join(root, "upstream.lock.json"), "utf8")
  );
  if (
    upstreamLock.repository !== "https://github.com/cursor/plugins.git" ||
    upstreamLock.ref !== "main" ||
    !/^[0-9a-f]{40}$/u.test(upstreamLock.commit) ||
    !Array.isArray(upstreamLock.sourceRoots) ||
    !upstreamLock.protectedPrefixes?.includes("extensions/pstack-router/")
  ) {
    failures.push("upstream.lock.json is missing an authoritative pinned source");
  }
} catch {
  // The JSON parse and existence failures above provide the actionable report.
}

for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  for (const token of forbiddenRuntimeBindings) {
    const pathKey = relative(root, path);
    if (source.includes(token) && !isAllowedRuntimeBinding(pathKey, token)) {
      failures.push(`${pathKey} contains forbidden runtime binding ${token}`);
    }
  }
}

const expectedSkillCount = requiredSkills.size;
if (skillDirs.length < expectedSkillCount) {
  failures.push(`expected at least ${expectedSkillCount} skill directories, found ${skillDirs.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`verified ${skillDirs.length} skill directories and ${markdownFiles.length} markdown files`);
}
