import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { forbiddenRuntimeBindings, isAllowedRuntimeBinding } from "./portability-bindings.mjs";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const agentsRoot = join(root, "agents");

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

test("skill authoring resolves through the bundled create-skill workflow", async () => {
  const authoring = await readFile(join(skillsRoot, "poteto-mode/playbooks/authoring-a-skill.md"), "utf8");
  const planning = await readFile(join(skillsRoot, "poteto-mode/references/plan.md"), "utf8");
  const createSkill = await readFile(join(skillsRoot, "create-skill/SKILL.md"), "utf8");

  assert.match(authoring, /\[create-skill\]\(\.\.\/\.\.\/create-skill\/SKILL\.md\)/u);
  assert.match(planning, /\[create-skill\]\(\.\.\/\.\.\/create-skill\/SKILL\.md\)/u);
  assert.match(createSkill, /^name: create-skill$/mu);
  assert.match(createSkill, /~\/\.agents\/skills\/skill-name\//u);
  assert.match(createSkill, /\.agents\/skills\/skill-name\//u);
  assert.match(createSkill, /## Core Authoring Principles/u);
  assert.match(createSkill, /## Common Patterns/u);
  assert.match(createSkill, /## Skill Creation Workflow/u);
  assert.equal(createSkill.split("\n").length <= 500, true);
  assert.doesNotMatch(createSkill, /Cursor|AskQuestion|\.cursor\//u);
  assert.doesNotMatch(`${authoring}\n${planning}`, /writing-for-agents/u);
});

test("portable skills contain no package-manager or host-specific resource bindings", async () => {
  for (const path of await markdownFiles(skillsRoot)) {
    const source = await readFile(path, "utf8");
    for (const token of forbiddenRuntimeBindings) {
      const pathKey = path.slice(root.length + 1);
      assert.equal(source.includes(token) && !isAllowedRuntimeBinding(pathKey, token), false, `${path} contains ${token}`);
    }
  }
});

test("the Pi package exposes valid bundled agents to pi-subagents", async () => {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.deepEqual(manifest.pi?.subagents?.agents, ["./agents"]);

  const files = (await readdir(agentsRoot)).filter((name) => name.endsWith(".md")).sort();
  assert.deepEqual(files, [
    "comment-sicko.md",
    "poteto-agent.md",
    "pstack-runtime-evidence.md",
    "pstack-runtime-read.md",
  ]);

  const names = [];
  for (const file of files) {
    const source = await readFile(join(agentsRoot, file), "utf8");
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/u)?.[1];
    assert.ok(frontmatter, `${file} has YAML frontmatter`);
    const name = frontmatter.match(/^name:\s*(.+)$/mu)?.[1]?.trim();
    assert.ok(name, `${file} has a runtime name`);
    names.push(name);
    assert.match(frontmatter, /^tools:\s*[^\n]+$/mu);
    assert.doesNotMatch(frontmatter, /^(?:model:\s*\[|thinkingLevel:|read-summarize:)/mu);
    assert.doesNotMatch(frontmatter, /\b(?:glob|lsp|ast_grep|yield)\b/u);
  }
  assert.equal(new Set(names).size, names.length);
});

test("pstack capability profiles declare the tools required before child execution", async () => {
  const readProfile = await readFile(join(agentsRoot, "pstack-runtime-read.md"), "utf8");
  const evidenceProfile = await readFile(join(agentsRoot, "pstack-runtime-evidence.md"), "utf8");
  const writerProfile = await readFile(join(agentsRoot, "poteto-agent.md"), "utf8");

  for (const tool of ["read", "grep", "find", "ls", "bash"]) {
    assert.match(readProfile, new RegExp(`^tools:.*\\b${tool}\\b`, "mu"));
    assert.match(evidenceProfile, new RegExp(`^tools:.*\\b${tool}\\b`, "mu"));
    assert.match(writerProfile, new RegExp(`^tools:.*\\b${tool}\\b`, "mu"));
  }
  for (const tool of ["mcp", "web_search", "source_check", "fetch_content", "get_search_content"]) {
    assert.match(evidenceProfile, new RegExp(`^tools:.*\\b${tool}\\b`, "mu"));
  }
  for (const tool of ["edit", "write"]) {
    assert.match(writerProfile, new RegExp(`^tools:.*\\b${tool}\\b`, "mu"));
    assert.doesNotMatch(readProfile, new RegExp(`^tools:.*\\b${tool}\\b`, "mu"));
  }
});
