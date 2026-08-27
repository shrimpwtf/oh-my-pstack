import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const load = (path) => readFile(resolve(root, path), "utf8");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const modelRoleLines = [
  "feature, refactoring",
  "bug-fix",
  "perf-issue",
  "hillclimb",
  "judgment and prose",
  "hardest tasks",
  "how explorer",
  "how explainer",
  "how critics",
  "why investigators",
  "why synthesizer",
  "reflect tooling",
  "reflect judgment, divergent, synthesizer",
  "arena runners",
  "arena cross-judge pool",
  "swarm workers",
  "architect runners",
  "interrogate reviewers",
];

const consumers = new Map([
  ["feature", "skills/poteto-mode/playbooks/feature.md"],
  ["refactoring", "skills/poteto-mode/playbooks/refactoring.md"],
  ["bug-fix", "skills/poteto-mode/playbooks/bug-fix.md"],
  ["perf-issue", "skills/poteto-mode/playbooks/perf-issue.md"],
  ["hillclimb", "skills/poteto-mode/playbooks/hillclimb.md"],
  ["judgment and prose", "skills/poteto-mode/SKILL.md"],
  ["hardest tasks", "skills/poteto-mode/SKILL.md"],
  ["how explorer", "skills/how/SKILL.md"],
  ["how explainer", "skills/how/SKILL.md"],
  ["how critics", "skills/how/SKILL.md"],
  ["why investigators", "skills/why/SKILL.md"],
  ["why synthesizer", "skills/why/SKILL.md"],
  ["reflect tooling", "skills/reflect/SKILL.md"],
  ["reflect judgment", "skills/reflect/SKILL.md"],
  ["reflect divergent", "skills/reflect/SKILL.md"],
  ["reflect synthesizer", "skills/reflect/SKILL.md"],
  ["arena runners", "skills/arena/SKILL.md"],
  ["arena cross-judge pool", "skills/arena/SKILL.md"],
  ["swarm workers", "skills/swarm/SKILL.md"],
  ["architect runners", "skills/architect/SKILL.md"],
  ["interrogate reviewers", "skills/interrogate/SKILL.md"],
]);

const routingTools = new Map([
  ["feature", "pstack_launch"],
  ["refactoring", "pstack_launch"],
  ["bug-fix", "pstack_launch"],
  ["perf-issue", "pstack_launch"],
  ["hillclimb", "pstack_launch"],
  ["judgment and prose", "pstack_launch"],
  ["hardest tasks", "pstack_launch"],
  ["how explorer", "pstack_launch"],
  ["how explainer", "pstack_launch"],
  ["how critics", "pstack_panel"],
  ["why investigators", "pstack_launch"],
  ["why synthesizer", "pstack_launch"],
  ["reflect tooling", "pstack_launch"],
  ["reflect judgment", "pstack_launch"],
  ["reflect divergent", "pstack_launch"],
  ["reflect synthesizer", "pstack_launch"],
  ["arena runners", "pstack_panel"],
  ["arena cross-judge pool", "pstack_launch"],
  ["swarm workers", "pstack_launch"],
  ["architect runners", "pstack_panel"],
  ["interrogate reviewers", "pstack_panel"],
]);

test("setup preserves every upstream pstack model role without writing host agent overrides", async () => {
  const setup = await load("skills/setup-pstack/SKILL.md");
  const shape = setup.match(/Keep these original model role lines and labels:\n\n```md\n([\s\S]*?)\n```/u)?.[1];
  assert.ok(shape);
  const configuredRoles = shape
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf(":")));
  assert.deepEqual(configuredRoles, modelRoleLines);
  assert.match(setup, /\[fast\]/u);
  assert.match(setup, /\/pstack-doctor/u);
  assert.match(setup, /`pstack_followup`/u);
  assert.match(setup, /`pstack_status`/u);
  assert.doesNotMatch(setup, /agentOverrides|\.pi\/settings\.json|opencode\.json/u);
});

test("runtime keeps pstack model roles independent from execution roles", async () => {
  const runtime = await load("skills/pstack-pi/references/runtime.md");
  const adapter = await load("skills/pstack-pi/SKILL.md");
  for (const source of [runtime, adapter]) {
    assert.match(source, /model roles and execution roles are independent/iu);
    assert.match(source, /per-run `model`/u);
    assert.match(source, /`pstack_launch`/u);
    assert.match(source, /`pstack_panel`/u);
    assert.match(source, /`pstack_followup`/u);
    assert.match(source, /`pstack_status`/u);
    assert.doesNotMatch(source, /subagents\.agentOverrides/u);
  }
  assert.doesNotMatch(adapter, /Do not put a `model` field/u);
});

test("every pstack model role uses the deterministic router in its owning workflow", async () => {
  for (const [role, path] of consumers) {
    const source = await load(path);
    const routingTool = routingTools.get(role);
    const rolePattern = new RegExp("`" + escapeRegExp(role) + "`", "gu");
    const occurrences = [...source.matchAll(rolePattern)];
    assert.ok(occurrences.length > 0, `${path} must consume ${role}`);
    assert.ok(routingTool);
    const scopedRoute = occurrences.some((occurrence) => {
      const index = occurrence.index ?? 0;
      const window = source.slice(Math.max(0, index - 300), index + 700);
      return window.includes(`\`${routingTool}\``);
    });
    assert.equal(scopedRoute, true, `${path} must route ${role} through ${routingTool} near the owning step`);
  }
});

test("swarm model races select configured model choices per arm", async () => {
  const swarm = await load("skills/swarm/SKILL.md");
  assert.match(swarm, /panel model role/u);
  assert.match(swarm, /configured `modelNumber`/u);
  assert.match(swarm, /too few distinct models/u);
});

test("upstream sync protects every adapted model-routing owner", async () => {
  const lock = JSON.parse(await load("upstream.lock.json"));
  const paths = new Set([
    ...consumers.values(),
    "skills/setup-pstack/SKILL.md",
    "skills/pstack-pi/SKILL.md",
    "skills/pstack-pi/references/runtime.md",
    "extensions/pstack-router/index.ts",
    "extensions/pstack-router/core.ts",
  ]);
  for (const path of paths) {
    const protectedPath = lock.protectedPaths.includes(path) || lock.protectedPrefixes.some((prefix) => path.startsWith(prefix));
    assert.equal(protectedPath, true, `${path} must stay outside automatic upstream writes`);
  }
});
