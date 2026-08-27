function stringTuple<const Values extends [string, ...string[]]>(...values: Values): Values {
  return values;
}

const THINKING_LEVELS = stringTuple("off", "minimal", "low", "medium", "high", "xhigh", "max");

export const EXECUTION_ROLES = stringTuple(
  "explorer",
  "watcher",
  "planner",
  "designer",
  "reviewer",
  "researcher",
  "synthesizer",
  "implementer",
  "owner",
  "mechanical",
);

export const CONTEXT_MODES = stringTuple("fresh", "fork");

export const MODEL_ROLES = stringTuple(
  "feature",
  "refactoring",
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
  "reflect judgment",
  "reflect divergent",
  "reflect synthesizer",
  "arena runners",
  "arena cross-judge pool",
  "swarm workers",
  "architect runners",
  "interrogate reviewers",
);

const PANEL_MODEL_ROLES = stringTuple(
  "how critics",
  "arena runners",
  "arena cross-judge pool",
  "swarm workers",
  "architect runners",
  "interrogate reviewers",
);

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export type ExecutionRole = (typeof EXECUTION_ROLES)[number];
export type PstackModelRole = (typeof MODEL_ROLES)[number];

export interface ExplicitModelChoice {
  kind: "model";
  model: string;
  thinking?: ThinkingLevel;
  fast: boolean;
  configured: string;
}

export interface InheritedModelChoice {
  kind: "inherit";
  source: "inherit-parent" | "auto";
  fast: false;
  configured: string;
}

export type ModelChoice = ExplicitModelChoice | InheritedModelChoice;

export interface PstackConfig {
  path: string;
  choices: ReadonlyMap<PstackModelRole, readonly ModelChoice[]>;
}

export interface ParentModelChoice {
  model: string;
  thinking?: ThinkingLevel;
}

export interface MaterializedModelChoice {
  model: string;
  thinking?: ThinkingLevel;
  fast: boolean;
  configured: string;
}

export interface RoutedTaskInput extends MaterializedModelChoice {
  modelRole: PstackModelRole;
  executionRole: ExecutionRole;
  agent: string;
  task: string;
}

export interface PanelWorkflowInput {
  modelRole: PstackModelRole;
  executionRole: ExecutionRole;
  agent: string;
  models: readonly MaterializedModelChoice[];
  tasks: readonly string[];
}

export interface ScalarWorkflowInput extends RoutedTaskInput {
  worktree: boolean;
}

export interface FollowupWorkflowInput {
  modelRole: PstackModelRole;
  childRunId: string;
  task: string;
}

interface ModelRolePrompt {
  workflow: string;
  instruction: string;
}

const MODEL_ROLE_PROMPTS = {
  "feature": {
    workflow: "poteto-mode",
    instruction: "Implement one settled feature from reproduced user behavior through end-to-end verification.",
  },
  "refactoring": {
    workflow: "poteto-mode",
    instruction: "Improve the internal design without changing observable behavior. Prove behavior before and after the change.",
  },
  "bug-fix": {
    workflow: "poteto-mode",
    instruction: "Reproduce the defect through the user surface. Find the root cause, apply the smallest complete fix, and verify the regression.",
  },
  "perf-issue": {
    workflow: "poteto-mode",
    instruction: "Measure the reported slow path, isolate the limiting cause, improve it, and compare the same benchmark.",
  },
  "hillclimb": {
    workflow: "poteto-mode",
    instruction: "Apply one measured improvement at a time. Keep only changes that improve the frozen objective without regressions.",
  },
  "judgment and prose": {
    workflow: "poteto-mode",
    instruction: "Make one evidence-based judgment or produce concise final prose without inventing facts.",
  },
  "hardest tasks": {
    workflow: "poteto-mode",
    instruction: "Own the hardest ambiguous unit. Resolve uncertainty from evidence before implementation or recommendation.",
  },
  "how explorer": {
    workflow: "how",
    instruction: "Trace the requested subsystem from entry point to effect. Return exact source evidence and the smallest useful mental model.",
  },
  "how explainer": {
    workflow: "how",
    instruction: "Explain the verified runtime flow, ownership boundaries, and extension points from the supplied evidence.",
  },
  "how critics": {
    workflow: "how",
    instruction: "Critique the frozen explanation independently. Report concrete omissions, contradictions, and unsupported claims.",
  },
  "why investigators": {
    workflow: "why",
    instruction: "Investigate one assigned evidence category. Separate direct evidence, inference, contradictions, and missing records.",
  },
  "why synthesizer": {
    workflow: "why",
    instruction: "Synthesize frozen investigation reports into one cited rationale. Preserve disagreement and uncertainty.",
  },
  "reflect tooling": {
    workflow: "reflect",
    instruction: "Audit the completed work for tool use, verification quality, avoidable failures, and reusable process improvements.",
  },
  "reflect judgment": {
    workflow: "reflect",
    instruction: "Audit decisions against available evidence. Identify unjustified confidence, drift, and missed alternatives.",
  },
  "reflect divergent": {
    workflow: "reflect",
    instruction: "Develop independent alternative interpretations of the completed work and test them against the evidence.",
  },
  "reflect synthesizer": {
    workflow: "reflect",
    instruction: "Combine frozen reflection reports into prioritized lessons with concrete evidence and bounded follow-up actions.",
  },
  "arena runners": {
    workflow: "arena",
    instruction: "Produce one independent candidate for the frozen problem. Follow the shared constraints and do not inspect other candidates.",
  },
  "arena cross-judge pool": {
    workflow: "arena",
    instruction: "Judge frozen candidates against the shared rubric. Cite concrete evidence and do not repair a candidate during judgment.",
  },
  "swarm workers": {
    workflow: "swarm",
    instruction: "Execute one disjoint assigned unit. Respect ownership boundaries and return a merge-ready artifact or precise blocker.",
  },
  "architect runners": {
    workflow: "architect",
    instruction: "Propose one independent architecture from current source and frozen constraints. Name ownership, interfaces, sequence, and tradeoffs.",
  },
  "interrogate reviewers": {
    workflow: "interrogate",
    instruction: "Review the frozen artifact adversarially against the supplied contract. Report only evidence-backed current findings.",
  },
} satisfies Record<PstackModelRole, ModelRolePrompt>;

const THINKING_LEVEL_SET: ReadonlySet<string> = new Set(THINKING_LEVELS);
const EXECUTION_ROLE_SET: ReadonlySet<string> = new Set(EXECUTION_ROLES);
const MODEL_ROLE_SET: ReadonlySet<string> = new Set(MODEL_ROLES);
const PANEL_MODEL_ROLE_SET: ReadonlySet<string> = new Set(PANEL_MODEL_ROLES);
const FAST_MODE_MODELS: ReadonlySet<string> = new Set([
  "openai-codex/gpt-5.6-luna",
  "openai-codex/gpt-5.6-sol",
]);

export class PstackConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PstackConfigError";
  }
}

export function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVEL_SET.has(value);
}

export function isExecutionRole(value: string): value is ExecutionRole {
  return EXECUTION_ROLE_SET.has(value);
}

export function isPstackModelRole(value: string): value is PstackModelRole {
  return MODEL_ROLE_SET.has(value);
}

export function isPanelModelRole(role: PstackModelRole): boolean {
  return PANEL_MODEL_ROLE_SET.has(role);
}

function rolesForLabel(label: string): readonly PstackModelRole[] | undefined {
  if (label === "feature, refactoring") return ["feature", "refactoring"];
  if (label === "reflect judgment, divergent, synthesizer") {
    return ["reflect judgment", "reflect divergent", "reflect synthesizer"];
  }
  return isPstackModelRole(label) ? [label] : undefined;
}

function lineError(path: string, line: number, message: string): PstackConfigError {
  return new PstackConfigError(`${path}:${line}: ${message}`);
}

function parseExplicitChoice(value: string, path: string, line: number): ExplicitModelChoice {
  const fastSuffix = " [fast]";
  const fast = value.endsWith(fastSuffix);
  const modelWithThinking = fast ? value.slice(0, -fastSuffix.length).trim() : value;
  if (!modelWithThinking || modelWithThinking.includes("[fast]")) {
    throw lineError(path, line, `invalid model choice '${value}'`);
  }

  const colon = modelWithThinking.lastIndexOf(":");
  const suffix = colon >= 0 ? modelWithThinking.slice(colon + 1) : "";
  const thinking = isThinkingLevel(suffix) ? suffix : undefined;
  const model = thinking ? modelWithThinking.slice(0, colon) : modelWithThinking;
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1 || /\s/u.test(model)) {
    throw lineError(path, line, `invalid Pi model '${model}'`);
  }
  if (fast && !FAST_MODE_MODELS.has(model)) {
    throw lineError(path, line, `fast supports only ${[...FAST_MODE_MODELS].join(", ")}; received '${model}'`);
  }

  return {
    kind: "model",
    model,
    ...(thinking ? { thinking } : {}),
    fast,
    configured: value,
  };
}

function parseChoice(value: string, path: string, line: number): ModelChoice {
  if (value === "inherit-parent" || value === "auto") {
    return {
      kind: "inherit",
      source: value,
      fast: false,
      configured: value,
    };
  }
  if (value === "inherit-parent [fast]" || value === "auto [fast]") {
    throw lineError(path, line, "fast requires an explicit supported model");
  }
  return parseExplicitChoice(value, path, line);
}

export function parsePstackConfig(source: string, path = ".pstack/config.md"): PstackConfig {
  const choices = new Map<PstackModelRole, readonly ModelChoice[]>();
  const lines = source.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index]?.trim() ?? "";
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw lineError(path, lineNumber, "expected '<model role>: <model choice>'");
    const label = line.slice(0, separator).trim();
    const values = line.slice(separator + 1).split(",").map((value) => value.trim());
    const roles = rolesForLabel(label);
    if (!roles) throw lineError(path, lineNumber, `unknown model role '${label}'`);
    if (values.length === 0 || values.some((value) => !value)) {
      throw lineError(path, lineNumber, `model role '${label}' has an empty choice`);
    }
    if (roles.some((role) => !isPanelModelRole(role)) && values.length !== 1) {
      throw lineError(path, lineNumber, `model role '${label}' requires exactly one choice`);
    }
    const parsed = values.map((value) => parseChoice(value, path, lineNumber));
    for (const role of roles) {
      if (choices.has(role)) throw lineError(path, lineNumber, `configuration duplicates model role '${role}'`);
      choices.set(role, parsed);
    }
  }

  return { path, choices };
}

export function resolveModelRole(config: PstackConfig, role: PstackModelRole): readonly ModelChoice[] {
  const choices = config.choices.get(role);
  if (!choices) throw new PstackConfigError(`${config.path}: missing model role '${role}'`);
  return choices;
}

export function missingModelRoles(config: PstackConfig): PstackModelRole[] {
  return MODEL_ROLES.filter((role) => !config.choices.has(role));
}

export function validateModelInventory(config: PstackConfig, inventory: ReadonlySet<string>): void {
  for (const [role, choices] of config.choices) {
    for (const choice of choices) {
      if (choice.kind === "model" && !inventory.has(choice.model)) {
        throw new PstackConfigError(`${config.path}: model role '${role}' uses unavailable model '${choice.model}'`);
      }
    }
  }
}

export function materializeModelChoices(
  choices: readonly ModelChoice[],
  parent: ParentModelChoice | undefined,
): MaterializedModelChoice[] {
  return choices.map((choice) => {
    if (choice.kind === "model") {
      return {
        model: choice.model,
        ...(choice.thinking ? { thinking: choice.thinking } : {}),
        fast: choice.fast,
        configured: choice.configured,
      };
    }
    if (!parent) throw new PstackConfigError(`model choice '${choice.source}' requires an active parent model`);
    return {
      model: parent.model,
      ...(parent.thinking ? { thinking: parent.thinking } : {}),
      fast: false,
      configured: choice.configured,
    };
  });
}

export function executionAgentFor(role: ExecutionRole): string {
  switch (role) {
    case "explorer":
    case "watcher":
    case "planner":
    case "designer":
    case "reviewer":
    case "synthesizer":
      return "pstack-runtime-read";
    case "researcher":
      return "pstack-runtime-evidence";
    case "implementer":
    case "owner":
    case "mechanical":
      return "poteto-agent";
  }
}

export function defaultContextFor(role: ExecutionRole): "fresh" | "fork" {
  switch (role) {
    case "implementer":
    case "owner":
    case "mechanical":
      return "fork";
    default:
      return "fresh";
  }
}

export function formatMaterializedModel(choice: MaterializedModelChoice): string {
  return choice.thinking ? `${choice.model}:${choice.thinking}` : choice.model;
}

function modelRolePrompt(role: PstackModelRole): ModelRolePrompt {
  return MODEL_ROLE_PROMPTS[role];
}

function runKey(role: PstackModelRole, number?: number): string {
  const base = role.replaceAll(" ", "-");
  return number === undefined ? base : `${base}-${number}`;
}

export function buildRoutedTask(input: RoutedTaskInput): string {
  const prompt = modelRolePrompt(input.modelRole);
  return [
    "PSTACK WORKFLOW IDENTITY",
    input.modelRole,
    "",
    "WORKFLOW",
    prompt.workflow,
    "",
    "ROLE PROMPT",
    prompt.instruction,
    "",
    "EXECUTION ROLE",
    input.executionRole,
    "",
    "RESOLVED MODEL",
    formatMaterializedModel(input),
    "",
    "FAST",
    input.fast ? "true" : "false",
    "",
    "TASK",
    input.task.trim(),
    "",
    "REPORT",
    "Report the model role, execution role, resolved model, thinking level, commands, result, deviations, and residual risks.",
  ].join("\n");
}

export function buildScalarWorkflowScript(input: ScalarWorkflowInput): string {
  const child = {
    agent: input.agent,
    model: formatMaterializedModel(input),
    ...(input.fast ? { fast: true } : {}),
    ...(input.worktree ? { worktree: true } : {}),
    label: input.modelRole,
    task: buildRoutedTask(input),
  };
  return `return runs.run(${JSON.stringify(runKey(input.modelRole))}, ${JSON.stringify(child)});`;
}

export function buildFollowupWorkflowScript(input: FollowupWorkflowInput): string {
  const child = {
    resume: input.childRunId,
    task: input.task.trim(),
    label: input.modelRole,
  };
  return `return runs.run(${JSON.stringify(runKey(input.modelRole))}, ${JSON.stringify(child)});`;
}

export function buildPanelWorkflowScript(input: PanelWorkflowInput): string {
  if (input.models.length === 0) throw new PstackConfigError(`model role '${input.modelRole}' has no choices`);
  if (input.tasks.length !== input.models.length) {
    throw new PstackConfigError(`model role '${input.modelRole}' requires ${input.models.length} panel tasks; received ${input.tasks.length}`);
  }
  const children = input.models.map((model, index) => ({
    key: runKey(input.modelRole, index + 1),
    agent: input.agent,
    model: formatMaterializedModel(model),
    ...(model.fast ? { fast: true } : {}),
    label: `${input.modelRole} ${index + 1}/${input.models.length}`,
    task: buildRoutedTask({
      modelRole: input.modelRole,
      executionRole: input.executionRole,
      agent: input.agent,
      ...model,
      task: input.tasks[index] ?? "",
    }),
  }));
  return `return runs.all(${JSON.stringify(children)});`;
}
