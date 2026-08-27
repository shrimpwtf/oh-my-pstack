import assert from "node:assert/strict";
import test from "node:test";
import {
  MODEL_ROLES,
  PstackConfigError,
  buildFollowupWorkflowScript,
  buildPanelWorkflowScript,
  buildRoutedTask,
  buildScalarWorkflowScript,
  executionAgentFor,
  materializeModelChoices,
  missingModelRoles,
  parsePstackConfig,
  resolveModelRole,
  validateModelInventory,
} from "../extensions/pstack-router/core.ts";

const configuration = `# pstack model configuration
feature, refactoring: openai-codex/gpt-5.6-sol:medium
bug-fix: openai-codex/gpt-5.6-sol:high
perf-issue: openai-codex/gpt-5.6-sol:high
hillclimb: openai-codex/gpt-5.6-sol:high
judgment and prose: anthropic/claude-opus-5:high
hardest tasks: openai-codex/gpt-5.6-sol:xhigh
how explorer: openai-codex/gpt-5.6-luna:xhigh [fast]
how explainer: anthropic/claude-fable-5:low
how critics: openai-codex/gpt-5.6-sol:medium, openai-codex/gpt-5.6-luna:xhigh [fast], anthropic/claude-fable-5:medium, anthropic/claude-opus-5:xhigh
why investigators: openai-codex/gpt-5.6-luna:xhigh
why synthesizer: openai-codex/gpt-5.6-sol:medium
reflect tooling: openai-codex/gpt-5.6-sol:xhigh
reflect judgment, divergent, synthesizer: anthropic/claude-fable-5:medium
arena runners: openai-codex/gpt-5.6-sol:medium, openai-codex/gpt-5.6-luna:xhigh, anthropic/claude-fable-5:medium, anthropic/claude-opus-5:xhigh
arena cross-judge pool: openai-codex/gpt-5.6-sol:medium, openai-codex/gpt-5.6-luna:xhigh, anthropic/claude-fable-5:medium, anthropic/claude-opus-5:xhigh
swarm workers: openai-codex/gpt-5.6-luna:xhigh, anthropic/claude-fable-5:medium
architect runners: openai-codex/gpt-5.6-sol:medium, openai-codex/gpt-5.6-luna:xhigh, anthropic/claude-fable-5:medium, anthropic/claude-opus-5:xhigh
interrogate reviewers: openai-codex/gpt-5.6-sol:medium, openai-codex/gpt-5.6-luna:xhigh, anthropic/claude-fable-5:medium, anthropic/claude-opus-5:xhigh
`;

const inventory = new Set([
  "openai-codex/gpt-5.6-sol",
  "openai-codex/gpt-5.6-luna",
  "anthropic/claude-fable-5",
  "anthropic/claude-opus-5",
]);

test("parses every canonical model role and expands shared labels", () => {
  const parsed = parsePstackConfig(configuration, "/project/.pstack/config.md");
  assert.deepEqual(missingModelRoles(parsed), []);
  assert.equal(resolveModelRole(parsed, "feature")[0]?.model, "openai-codex/gpt-5.6-sol");
  assert.equal(resolveModelRole(parsed, "refactoring")[0]?.thinking, "medium");
  assert.equal(resolveModelRole(parsed, "reflect divergent")[0]?.model, "anthropic/claude-fable-5");
  assert.equal(resolveModelRole(parsed, "reflect synthesizer")[0]?.thinking, "medium");
  assert.equal(resolveModelRole(parsed, "swarm workers").length, 2);
});

test("keeps fast separate from the model and thinking", () => {
  const parsed = parsePstackConfig(configuration, "/project/.pstack/config.md");
  const choice = resolveModelRole(parsed, "how explorer")[0];
  assert.deepEqual(choice, {
    kind: "model",
    model: "openai-codex/gpt-5.6-luna",
    thinking: "xhigh",
    fast: true,
    configured: "openai-codex/gpt-5.6-luna:xhigh [fast]",
  });
});

test("rejects fast for unsupported models", () => {
  assert.throws(
    () => parsePstackConfig("how explorer: anthropic/claude-fable-5:low [fast]", "config.md"),
    (error) => error instanceof PstackConfigError && /fast supports only/u.test(error.message),
  );
});

test("rejects duplicate and unknown model roles", () => {
  assert.throws(
    () => parsePstackConfig("feature: openai-codex/gpt-5.6-sol:low\nfeature, refactoring: openai-codex/gpt-5.6-sol:medium", "config.md"),
    (error) => error instanceof PstackConfigError && /duplicates model role 'feature'/u.test(error.message),
  );
  assert.throws(
    () => parsePstackConfig("reviewer: openai-codex/gpt-5.6-sol:low", "config.md"),
    (error) => error instanceof PstackConfigError && /unknown model role/u.test(error.message),
  );
});

test("rejects models absent from the live inventory", () => {
  const parsed = parsePstackConfig(configuration.replaceAll("openai-codex/gpt-5.6-sol", "oopenai-codex/gpt-5.6-sol"), "config.md");
  assert.throws(
    () => validateModelInventory(parsed, inventory),
    (error) => error instanceof PstackConfigError && /oopenai-codex/u.test(error.message),
  );
});

test("materializes explicit and inherited model choices", () => {
  const explicit = resolveModelRole(parsePstackConfig(configuration, "config.md"), "bug-fix");
  assert.deepEqual(materializeModelChoices(explicit, undefined), [{
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
    fast: false,
    configured: "openai-codex/gpt-5.6-sol:high",
  }]);

  const inherited = resolveModelRole(parsePstackConfig("bug-fix: inherit-parent", "config.md"), "bug-fix");
  assert.deepEqual(materializeModelChoices(inherited, {
    model: "anthropic/claude-opus-5",
    thinking: "xhigh",
  }), [{
    model: "anthropic/claude-opus-5",
    thinking: "xhigh",
    fast: false,
    configured: "inherit-parent",
  }]);
  assert.equal(materializeModelChoices(inherited, {
    model: "openai-codex/gpt-5.6-sol",
    thinking: "off",
  })[0]?.thinking, "off");
});

test("maps every execution role without selecting models", () => {
  assert.deepEqual({
    explorer: executionAgentFor("explorer"),
    watcher: executionAgentFor("watcher"),
    planner: executionAgentFor("planner"),
    designer: executionAgentFor("designer"),
    reviewer: executionAgentFor("reviewer"),
    researcher: executionAgentFor("researcher"),
    synthesizer: executionAgentFor("synthesizer"),
    implementer: executionAgentFor("implementer"),
    owner: executionAgentFor("owner"),
    mechanical: executionAgentFor("mechanical"),
  }, {
    explorer: "pstack-runtime-read",
    watcher: "pstack-runtime-read",
    planner: "pstack-runtime-read",
    designer: "pstack-runtime-read",
    reviewer: "pstack-runtime-read",
    researcher: "pstack-runtime-evidence",
    synthesizer: "pstack-runtime-read",
    implementer: "poteto-agent",
    owner: "poteto-agent",
    mechanical: "poteto-agent",
  });
});

test("adds an auditable route header to every child task", () => {
  const task = buildRoutedTask({
    modelRole: "bug-fix",
    executionRole: "implementer",
    agent: "poteto-agent",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
    fast: false,
    task: "Fix the reproduced defect.",
  });
  assert.match(task, /PSTACK WORKFLOW IDENTITY\nbug-fix/u);
  assert.match(task, /WORKFLOW\npoteto-mode/u);
  assert.match(task, /ROLE PROMPT\nReproduce the defect through the user surface\./u);
  assert.match(task, /EXECUTION ROLE\nimplementer/u);
  assert.doesNotMatch(task, /PI AGENT|worker/u);
  assert.match(task, /RESOLVED MODEL\nopenai-codex\/gpt-5\.6-sol:high/u);
});

test("injects a workflow and role prompt for every setup model role", () => {
  for (const modelRole of MODEL_ROLES) {
    const task = buildRoutedTask({
      modelRole,
      executionRole: "reviewer",
      agent: "pstack-runtime-read",
      model: "openai-codex/gpt-5.6-sol",
      fast: false,
      task: "Execute the bounded brief.",
    });
    assert.match(task, new RegExp(`PSTACK WORKFLOW IDENTITY\\n${modelRole.replaceAll(" ", "\\s")}\\n`, "u"));
    assert.match(task, /WORKFLOW\n[^\n]+\n\nROLE PROMPT\n[^\n]+/u);
    assert.doesNotMatch(task, /PI AGENT|pstack-runtime-read/u);
  }
});

test("builds a labeled scalar workflow that keeps the runtime agent internal", () => {
  const script = buildScalarWorkflowScript({
    modelRole: "how explorer",
    executionRole: "explorer",
    agent: "pstack-runtime-read",
    model: "openai-codex/gpt-5.6-luna",
    thinking: "xhigh",
    fast: true,
    task: "Trace the request flow.",
    worktree: false,
  });
  assert.doesNotThrow(() => new Function("runs", script));
  assert.match(script, /runs\.run\("how-explorer"/u);
  assert.match(script, /"label":"how explorer"/u);
  assert.match(script, /"agent":"pstack-runtime-read"/u);
});

test("builds a labeled owner follow-up with the retained child", () => {
  const script = buildFollowupWorkflowScript({
    modelRole: "hardest tasks",
    childRunId: "owner-child-1",
    task: "Apply the accepted review findings.",
  });
  assert.doesNotThrow(() => new Function("runs", script));
  assert.match(script, /runs\.run\("hardest-tasks"/u);
  assert.match(script, /"resume":"owner-child-1"/u);
  assert.match(script, /"label":"hardest tasks"/u);
});

test("builds a valid panel script with per-child models and fast flags", () => {
  const parsed = parsePstackConfig(configuration, "config.md");
  const models = materializeModelChoices(resolveModelRole(parsed, "how critics"), undefined);
  const script = buildPanelWorkflowScript({
    modelRole: "how critics",
    executionRole: "reviewer",
    agent: "pstack-runtime-read",
    models,
    tasks: models.map((_, index) => `Review angle ${index + 1}.`),
  });
  assert.doesNotThrow(() => new Function("runs", script));
  assert.match(script, /openai-codex\/gpt-5\.6-luna:xhigh/u);
  assert.match(script, /"fast":true/u);
  assert.match(script, /anthropic\/claude-opus-5:xhigh/u);
  assert.match(script, /"key":"how-critics-1"/u);
  assert.match(script, /"label":"how critics 1\/4"/u);
});
