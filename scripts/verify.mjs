import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const requiredSkills = new Set([
  "architect",
  "arena",
  "automate-me",
  "blast-radius",
  "bro",
  "create-verification-skill",
  "figure-it-out",
  "how",
  "interrogate",
  "maintain-verification-skill",
  "make-bot-ui",
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
  "principle-attack-the-premise",
  "principle-test-behavior-not-implementation",
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

for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(/\]\(([^)#][^)]*)\)/gu)) {
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
  if (requiredKeywords.some((keyword) => !packageManifest.keywords?.includes(keyword))) {
    failures.push("package.json is missing discoverability keywords");
  }
  const claudeManifest = JSON.parse(
    await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8")
  );
  if (claudeManifest.name !== "pstack-pi") {
    failures.push(".claude-plugin/plugin.json does not use the pstack-pi name");
  }
  const codexManifest = JSON.parse(
    await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8")
  );
  if (codexManifest.name !== "pstack-pi" || codexManifest.skills !== "./skills/") {
    failures.push(".codex-plugin/plugin.json has incorrect package identity or skills path");
  }
  const upstreamLock = JSON.parse(
    await readFile(join(root, "upstream.lock.json"), "utf8")
  );
  if (
    upstreamLock.repository !== "https://github.com/cursor/plugins.git" ||
    upstreamLock.ref !== "main" ||
    !/^[0-9a-f]{40}$/u.test(upstreamLock.commit) ||
    !Array.isArray(upstreamLock.sourceRoots)
  ) {
    failures.push("upstream.lock.json is missing an authoritative pinned source");
  }
} catch {
  // The JSON parse and existence failures above provide the actionable report.
}

const forbidden = [
  "~/.cursor/",
  ".cursor/skills/",
  ".cursor/plugins/",
  "subagent_type:",
  "AskQuestion",
  "environment: \"cloud\"",
  "claude-fable-5-thinking-max",
  "claude-fable-5-1-thinking-max",
  "gpt-5.6-sol-max",
  "grok-4.6-fast-xhigh",
  "claude-opus-5-thinking-xhigh",
];
for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      failures.push(`${relative(root, path)} contains forbidden runtime binding ${token}`);
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
