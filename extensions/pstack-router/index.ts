import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  CONTEXT_MODES,
  EXECUTION_ROLES,
  MODEL_ROLES,
  PstackConfigError,
  buildFollowupWorkflowScript,
  buildPanelWorkflowScript,
  buildScalarWorkflowScript,
  defaultContextFor,
  executionAgentFor,
  isExecutionRole,
  isPanelModelRole,
  isPstackModelRole,
  isThinkingLevel,
  materializeModelChoices,
  missingModelRoles,
  parsePstackConfig,
  resolveModelRole,
  validateModelInventory,
  type ExecutionRole,
  type MaterializedModelChoice,
  type ParentModelChoice,
  type PstackConfig,
  type PstackModelRole,
  type ThinkingLevel,
} from "./core.ts";

const RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";
const ASYNC_COMPLETE_EVENT = "subagent:async-complete";
const LEDGER_ENTRY = "pstack-route";
const RPC_TIMEOUT_MS = 10_000;

interface RouteLedgerChoice {
  number: number;
  configured: string;
  model: string;
  thinking?: ThinkingLevel;
  fast: boolean;
}

interface RouteLedgerLaunch {
  version: 1;
  kind: "launch";
  runId: string;
  previousRunId?: string;
  sessionId: string;
  configPath: string;
  modelRole: PstackModelRole;
  executionRole: ExecutionRole;
  agent: string;
  context: "fresh" | "fork";
  worktree: boolean;
  cwd: string;
  choices: RouteLedgerChoice[];
  startedAt: string;
}

interface ObservedChild {
  index?: number;
  runId?: string;
  agent?: string;
  model?: string;
  thinking?: string;
  status?: string;
}

interface RouteLedgerCompletion {
  version: 1;
  kind: "completion";
  runId: string;
  sessionId: string;
  modelRole: PstackModelRole;
  executionRole: ExecutionRole;
  agent: string;
  state: string;
  success?: boolean;
  observed: ObservedChild[];
  routingFailures: string[];
  childFailures: string[];
  completedAt: string;
}

interface PreparedRoute {
  config: PstackConfig;
  sessionId: string;
  modelRole: PstackModelRole;
  executionRole: ExecutionRole;
  agent: string;
  context: "fresh" | "fork";
  cwd: string;
  models: MaterializedModelChoice[];
}

interface RpcReplyError {
  code?: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function booleanField(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key];
  return typeof field === "boolean" ? field : undefined;
}

function rpcError(value: unknown): RpcReplyError {
  if (!isRecord(value)) return { message: "Unknown pi-subagents RPC error" };
  const code = stringField(value, "code");
  return {
    ...(code ? { code } : {}),
    message: stringField(value, "message") ?? "Unknown pi-subagents RPC error",
  };
}

function rpcCall(
  pi: ExtensionAPI,
  method: "ping" | "spawn" | "resume",
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(new Error("The pstack RPC request was cancelled."));
  const requestId = randomUUID();
  const replyEvent = `${RPC_REPLY_PREFIX}${requestId}`;

  return new Promise((resolveReply, rejectReply) => {
    let settled = false;
    const finish = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      operation();
    };
    const abort = (): void => finish(() => rejectReply(new Error("The pstack route launch was cancelled.")));
    const unsubscribe = pi.events.on(replyEvent, (value) => {
      if (!isRecord(value) || stringField(value, "requestId") !== requestId) return;
      if (value.success === true) {
        finish(() => resolveReply(value.data));
        return;
      }
      if (value.success === false) {
        const error = rpcError(value.error);
        finish(() => rejectReply(new Error(error.code ? `${error.code}: ${error.message}` : error.message)));
        return;
      }
      finish(() => rejectReply(new Error("pi-subagents returned an invalid RPC reply.")));
    });
    const timer = setTimeout(() => {
      finish(() => rejectReply(new Error("pi-subagents did not answer the pstack RPC request. Verify that the pi-subagents extension is active.")));
    }, RPC_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    pi.events.emit(RPC_REQUEST_EVENT, {
      version: 1,
      requestId,
      method,
      params,
    });
  });
}

function resolveConfigPath(cwd: string): string {
  const override = process.env.PSTACK_CONFIG?.trim();
  if (!override) return join(cwd, ".pstack", "config.md");
  return isAbsolute(override) ? override : resolve(cwd, override);
}

async function loadConfig(cwd: string): Promise<PstackConfig> {
  const path = resolveConfigPath(cwd);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PstackConfigError(`Cannot read pstack configuration '${path}': ${message}`);
  }
  return parsePstackConfig(source, path);
}

function parentChoice(ctx: ExtensionContext): ParentModelChoice | undefined {
  if (!ctx.model) return undefined;
  const thinking = ctx.thinkingLevel && isThinkingLevel(ctx.thinkingLevel) ? ctx.thinkingLevel : undefined;
  return {
    model: `${ctx.model.provider}/${ctx.model.id}`,
    ...(thinking ? { thinking } : {}),
  };
}

function validateAvailableModels(
  config: PstackConfig,
  models: readonly MaterializedModelChoice[],
  ctx: ExtensionContext,
): void {
  const available = ctx.modelRegistry.getAvailable();
  const inventory = new Set(available.map((model) => `${model.provider}/${model.id}`));
  validateModelInventory(config, inventory);

  if (ctx.scopedModels.length > 0) {
    const scoped = new Set(ctx.scopedModels.map((entry) => `${entry.model.provider}/${entry.model.id}`));
    for (const model of models) {
      if (!scoped.has(model.model)) {
        throw new PstackConfigError(`${config.path}: resolved model '${model.model}' is outside the active Pi model scope`);
      }
    }
  }

  for (const model of models) {
    const registered = available.find((entry) => `${entry.provider}/${entry.id}` === model.model);
    if (registered && registered.reasoning === false && model.thinking && model.thinking !== "off") {
      throw new PstackConfigError(`${config.path}: model '${model.model}' does not support thinking level '${model.thinking}'`);
    }
  }
}

async function prepareRoute(
  params: {
    modelRole: string;
    executionRole: string;
    context?: "fresh" | "fork";
    cwd?: string;
  },
  ctx: ExtensionContext,
): Promise<PreparedRoute> {
  if (!isPstackModelRole(params.modelRole)) throw new PstackConfigError(`Unknown pstack model role '${params.modelRole}'.`);
  if (!isExecutionRole(params.executionRole)) throw new PstackConfigError(`Unknown pstack execution role '${params.executionRole}'.`);
  const cwd = resolve(ctx.cwd, params.cwd ?? ".");
  const config = await loadConfig(cwd);
  const configured = resolveModelRole(config, params.modelRole);
  const models = materializeModelChoices(configured, parentChoice(ctx));
  validateAvailableModels(config, models, ctx);
  const agent = executionAgentFor(params.executionRole);
  return {
    config,
    sessionId: ctx.sessionManager.getSessionId(),
    modelRole: params.modelRole,
    executionRole: params.executionRole,
    agent,
    context: params.context ?? defaultContextFor(params.executionRole),
    cwd,
    models,
  };
}

function extractRunId(value: unknown): string {
  if (!isRecord(value)) throw new Error("pi-subagents returned an invalid route reply.");
  const details = isRecord(value.details) ? value.details : value;
  const runId = stringField(details, "runId") ?? stringField(details, "asyncId");
  if (!runId) throw new Error("pi-subagents did not return a run identifier.");
  return runId;
}

function ledgerChoices(models: readonly MaterializedModelChoice[]): RouteLedgerChoice[] {
  return models.map((choice, index) => ({
    number: index + 1,
    configured: choice.configured,
    model: choice.model,
    ...(choice.thinking ? { thinking: choice.thinking } : {}),
    fast: choice.fast,
  }));
}

function appendLaunch(
  pi: ExtensionAPI,
  active: Map<string, RouteLedgerLaunch>,
  route: PreparedRoute,
  runId: string,
  models: readonly MaterializedModelChoice[],
  worktree: boolean,
): RouteLedgerLaunch {
  const launch: RouteLedgerLaunch = {
    version: 1,
    kind: "launch",
    runId,
    sessionId: route.sessionId,
    configPath: route.config.path,
    modelRole: route.modelRole,
    executionRole: route.executionRole,
    agent: route.agent,
    context: route.context,
    worktree,
    cwd: route.cwd,
    choices: ledgerChoices(models),
    startedAt: new Date().toISOString(),
  };
  active.set(runId, launch);
  pi.appendEntry(LEDGER_ENTRY, launch);
  return launch;
}

function parseLedgerChoice(value: unknown): RouteLedgerChoice | undefined {
  if (!isRecord(value)) return undefined;
  const number = numberField(value, "number");
  const configured = stringField(value, "configured");
  const model = stringField(value, "model");
  const thinking = stringField(value, "thinking");
  const fast = booleanField(value, "fast");
  if (!number || !configured || !model || fast === undefined) return undefined;
  let resolvedThinking: ThinkingLevel | undefined;
  if (thinking) {
    if (!isThinkingLevel(thinking)) return undefined;
    resolvedThinking = thinking;
  }
  return {
    number,
    configured,
    model,
    ...(resolvedThinking ? { thinking: resolvedThinking } : {}),
    fast,
  };
}

function parseLedgerLaunch(value: unknown, fallbackSessionId: string): RouteLedgerLaunch | undefined {
  if (!isRecord(value) || value.version !== 1 || value.kind !== "launch") return undefined;
  const runId = stringField(value, "runId");
  const previousRunId = stringField(value, "previousRunId");
  const sessionId = stringField(value, "sessionId") ?? fallbackSessionId;
  const configPath = stringField(value, "configPath");
  const modelRole = stringField(value, "modelRole");
  const executionRole = stringField(value, "executionRole");
  const agent = stringField(value, "agent");
  const context = stringField(value, "context");
  const worktree = booleanField(value, "worktree") ?? false;
  const cwd = stringField(value, "cwd");
  const startedAt = stringField(value, "startedAt");
  const choices = Array.isArray(value.choices) ? value.choices.map(parseLedgerChoice) : [];
  if (
    !runId ||
    !configPath ||
    !modelRole ||
    !isPstackModelRole(modelRole) ||
    !executionRole ||
    !isExecutionRole(executionRole) ||
    !agent ||
    (context !== "fresh" && context !== "fork") ||
    !cwd ||
    !startedAt ||
    choices.length === 0 ||
    choices.some((choice) => !choice)
  ) return undefined;
  const completeChoices: RouteLedgerChoice[] = [];
  for (const choice of choices) {
    if (choice) completeChoices.push(choice);
  }
  return {
    version: 1,
    kind: "launch",
    runId,
    ...(previousRunId ? { previousRunId } : {}),
    sessionId,
    configPath,
    modelRole,
    executionRole,
    agent,
    context,
    worktree,
    cwd,
    choices: completeChoices,
    startedAt,
  };
}

function observedChild(value: unknown): ObservedChild | undefined {
  if (!isRecord(value)) return undefined;
  const index = numberField(value, "index");
  const runId = stringField(value, "runId");
  const agent = stringField(value, "agent");
  const model = stringField(value, "model");
  const thinking = stringField(value, "thinking");
  const status = stringField(value, "status") ?? stringField(value, "state");
  if (index === undefined && !runId && !agent && !model && !thinking && !status) return undefined;
  return {
    ...(index !== undefined ? { index } : {}),
    ...(runId ? { runId } : {}),
    ...(agent ? { agent } : {}),
    ...(model ? { model } : {}),
    ...(thinking ? { thinking } : {}),
    ...(status ? { status } : {}),
  };
}

function completionChildren(value: unknown): ObservedChild[] {
  if (!isRecord(value)) return [];
  if (isRecord(value.workflowChildren) && Array.isArray(value.workflowChildren.children)) {
    const children = value.workflowChildren.children.flatMap((item) => {
      const child = observedChild(item);
      return child ? [child] : [];
    });
    if (children.length > 0) return children;
  }
  if (Array.isArray(value.results)) {
    const results = value.results.flatMap((item) => {
      const child = observedChild(item);
      return child ? [child] : [];
    });
    if (results.length > 0) return results;
  }
  const direct = observedChild(value);
  return direct ? [direct] : [];
}

function observedMatchesExpected(observed: ObservedChild, expected: RouteLedgerChoice): boolean {
  if (!observed.model) return false;
  const expectedModel = expected.thinking ? `${expected.model}:${expected.thinking}` : expected.model;
  if (observed.model === expectedModel) return !expected.thinking || !observed.thinking || observed.thinking === expected.thinking;
  if (observed.model === expected.model) return !expected.thinking || observed.thinking === expected.thinking;
  return false;
}

function routingFailures(launch: RouteLedgerLaunch, observed: readonly ObservedChild[]): string[] {
  const failures: string[] = [];
  for (let index = 0; index < launch.choices.length; index += 1) {
    const expected = launch.choices[index];
    const actual = observed[index];
    if (!expected) continue;
    if (!actual) {
      failures.push(`choice ${expected.number} has no observed child model`);
      continue;
    }
    if (actual.agent && actual.agent !== launch.agent) {
      failures.push(`choice ${expected.number} expected agent '${launch.agent}' but observed '${actual.agent}'`);
    }
    if (!observedMatchesExpected(actual, expected)) {
      const actualModel = actual.model ? `${actual.model}${actual.thinking && !actual.model.endsWith(`:${actual.thinking}`) ? `:${actual.thinking}` : ""}` : "missing";
      const expectedModel = expected.thinking ? `${expected.model}:${expected.thinking}` : expected.model;
      failures.push(`choice ${expected.number} expected model '${expectedModel}' but observed '${actualModel}'`);
    }
  }
  return failures;
}

function childFailures(observed: readonly ObservedChild[]): string[] {
  return observed.flatMap((child, index) => {
    if (!child.status || child.status === "complete" || child.status === "completed") return [];
    return [`choice ${index + 1} ended with child state '${child.status}'`];
  });
}

function completionState(value: Record<string, unknown>): string {
  return stringField(value, "state") ?? stringField(value, "status") ?? (value.success === true ? "completed" : value.success === false ? "failed" : "unknown");
}

function restoreLedger(active: Map<string, RouteLedgerLaunch>, ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  for (const [runId, launch] of active) {
    if (launch.sessionId === sessionId) active.delete(runId);
  }
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "custom" || entry.customType !== LEDGER_ENTRY || !isRecord(entry.data)) continue;
    if (entry.data.kind === "completion") {
      const runId = stringField(entry.data, "runId");
      if (runId) active.delete(runId);
      continue;
    }
    const launch = parseLedgerLaunch(entry.data, sessionId);
    if (launch) active.set(launch.runId, launch);
  }
}

function appendFollowupLaunch(
  pi: ExtensionAPI,
  active: Map<string, RouteLedgerLaunch>,
  source: RouteLedgerLaunch,
  runId: string,
  sessionId: string,
): RouteLedgerLaunch {
  const launch: RouteLedgerLaunch = {
    ...source,
    runId,
    previousRunId: source.runId,
    sessionId,
    startedAt: new Date().toISOString(),
  };
  active.set(runId, launch);
  pi.appendEntry(LEDGER_ENTRY, launch);
  return launch;
}

function formatLaunchText(launch: RouteLedgerLaunch): string {
  const choices = launch.choices.map((choice) => {
    const model = choice.thinking ? `${choice.model}:${choice.thinking}` : choice.model;
    return `${choice.number}. ${model}${choice.fast ? " [fast]" : ""}`;
  });
  return [
    `Pstack model role: ${launch.modelRole}`,
    `Run: ${launch.runId}`,
    `Execution role: ${launch.executionRole}`,
    `Context: ${launch.context}`,
    `Worktree: ${launch.worktree}`,
    "Resolved models:",
    ...choices,
    "Use subagent status or subagent_wait with this run identifier.",
    "Then call pstack_status. Accept the child result only when success is true and both failure lists are empty.",
  ].join("\n");
}

function routeEntry(ctx: ExtensionContext, runId: string): Record<string, unknown> | undefined {
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== LEDGER_ENTRY || !isRecord(entry.data)) continue;
    if (stringField(entry.data, "runId") === runId) return entry.data;
  }
  return undefined;
}

function routeLaunch(ctx: ExtensionContext, runId: string): RouteLedgerLaunch | undefined {
  const sessionId = ctx.sessionManager.getSessionId();
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== LEDGER_ENTRY || !isRecord(entry.data)) continue;
    if (entry.data.kind !== "launch" || stringField(entry.data, "runId") !== runId) continue;
    return parseLedgerLaunch(entry.data, sessionId);
  }
  return undefined;
}

function failureFields(value: Record<string, unknown>, key: string): string[] {
  const failures = value[key];
  return Array.isArray(failures) ? failures.filter((item) => typeof item === "string") : [];
}

function formatRouteStatus(input: unknown): string {
  if (!isRecord(input)) throw new PstackConfigError("The pstack route ledger contains invalid status data.");
  const value = input;
  const runId = stringField(value, "runId") ?? "unknown";
  const kind = stringField(value, "kind") ?? "unknown";
  const state = stringField(value, "state") ?? (kind === "launch" ? "running" : "unknown");
  const success = booleanField(value, "success");
  const modelRole = stringField(value, "modelRole") ?? "unknown";
  const executionRole = stringField(value, "executionRole") ?? "unknown";
  const routing = failureFields(value, "routingFailures");
  const children = failureFields(value, "childFailures");
  const observed = Array.isArray(value.observed) ? JSON.stringify(value.observed) : "[]";
  return [
    `Pstack model role: ${modelRole}`,
    `Execution role: ${executionRole}`,
    `Run: ${runId}`,
    `State: ${state}`,
    `Success: ${success === undefined ? "pending" : String(success)}`,
    `Routing failures: ${routing.length > 0 ? routing.join(" | ") : "none"}`,
    `Child failures: ${children.length > 0 ? children.join(" | ") : "none"}`,
    `Observed children: ${observed}`,
  ].join("\n");
}

function routeHistory(ctx: ExtensionContext): string[] {
  const history: string[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "custom" || entry.customType !== LEDGER_ENTRY || !isRecord(entry.data)) continue;
    const runId = stringField(entry.data, "runId");
    const modelRole = stringField(entry.data, "modelRole");
    const executionRole = stringField(entry.data, "executionRole");
    const kind = stringField(entry.data, "kind");
    const state = stringField(entry.data, "state");
    if (runId && modelRole && executionRole && kind) {
      history.push(`${kind} ${runId} | ${modelRole} | ${executionRole}${state ? ` | ${state}` : ""}`);
    }
  }
  return history.slice(-20);
}

function validateRpcCapabilities(value: unknown): void {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.methods) ||
    !value.methods.includes("spawn") ||
    !value.methods.includes("resume")
  ) {
    throw new PstackConfigError("The active pi-subagents RPC bridge does not support pstack spawn and resume requests.");
  }
}

async function runDoctor(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  try {
    const config = await loadConfig(ctx.cwd);
    const missing = missingModelRoles(config);
    if (missing.length > 0) throw new PstackConfigError(`${config.path}: missing model roles: ${missing.join(", ")}`);
    const allModels = [...config.choices.values()].flatMap((choices) => materializeModelChoices(choices, parentChoice(ctx)));
    validateAvailableModels(config, allModels, ctx);
    const capabilities = await rpcCall(pi, "ping", {}, ctx.signal);
    validateRpcCapabilities(capabilities);
    ctx.ui.notify(`Pstack routing is ready.\nConfig: ${config.path}\nModel roles: ${config.choices.size}`, "info");
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

export default function pstackRouter(pi: ExtensionAPI): void {
  const active = new Map<string, RouteLedgerLaunch>();
  const pending = new Map<string, RouteLedgerCompletion[]>();
  let currentSessionId: string | undefined;

  const persistCompletion = (completion: RouteLedgerCompletion): void => {
    pi.appendEntry(LEDGER_ENTRY, completion);
    if (completion.routingFailures.length > 0 || completion.childFailures.length > 0) {
      pi.sendMessage({
        customType: completion.routingFailures.length > 0 ? "pstack-routing-failure" : "pstack-child-failure",
        content: completion.routingFailures.length > 0
          ? `Pstack rejected route ${completion.runId}. ${completion.routingFailures.join(" ")}`
          : `Pstack route ${completion.runId} contains a failed child. ${completion.childFailures.join(" ")}`,
        display: true,
      }, { triggerTurn: false });
    }
  };

  pi.on("session_start", (_event, ctx) => {
    currentSessionId = ctx.sessionManager.getSessionId();
    restoreLedger(active, ctx);
    const completions = pending.get(currentSessionId) ?? [];
    pending.delete(currentSessionId);
    for (const completion of completions) {
      active.delete(completion.runId);
      persistCompletion(completion);
    }
  });

  pi.events.on(ASYNC_COMPLETE_EVENT, (value) => {
    if (!isRecord(value)) return;
    const runId = stringField(value, "runId") ?? stringField(value, "id");
    if (!runId) return;
    const launch = active.get(runId);
    if (!launch) return;
    const observed = completionChildren(value);
    const failures = routingFailures(launch, observed);
    const failedChildren = childFailures(observed);
    const completion: RouteLedgerCompletion = {
      version: 1,
      kind: "completion",
      runId,
      sessionId: launch.sessionId,
      modelRole: launch.modelRole,
      executionRole: launch.executionRole,
      agent: launch.agent,
      state: failures.length > 0 ? "routing_failed" : failedChildren.length > 0 ? "child_failed" : completionState(value),
      ...(failures.length > 0 || failedChildren.length > 0 ? { success: false } : typeof value.success === "boolean" ? { success: value.success } : {}),
      observed,
      routingFailures: failures,
      childFailures: failedChildren,
      completedAt: new Date().toISOString(),
    };
    active.delete(runId);
    if (currentSessionId && launch.sessionId !== currentSessionId) {
      const completions = pending.get(launch.sessionId) ?? [];
      completions.push(completion);
      pending.set(launch.sessionId, completions);
      return;
    }
    persistCompletion(completion);
  });

  pi.registerTool(defineTool({
    name: "pstack_status",
    label: "Pstack Status",
    description: "Read the validated route state from the pstack session ledger before accepting a child result.",
    parameters: Type.Object({
      runId: Type.String({ minLength: 1, description: "The run identifier returned by pstack_launch or pstack_panel." }),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stored = routeEntry(ctx, params.runId);
      if (stored) {
        return {
          content: [{ type: "text", text: formatRouteStatus(stored) }],
          details: stored,
        };
      }
      const launch = active.get(params.runId);
      if (launch && launch.sessionId === ctx.sessionManager.getSessionId()) {
        return {
          content: [{ type: "text", text: formatRouteStatus(launch) }],
          details: launch,
        };
      }
      throw new PstackConfigError(`Pstack route '${params.runId}' does not exist in the active session.`);
    },
  }));

  pi.registerCommand("pstack-doctor", {
    description: "Validate the pstack configuration, model inventory, and pi-subagents RPC bridge",
    handler: async (_args, ctx) => runDoctor(pi, ctx),
  });

  pi.registerCommand("pstack-routes", {
    description: "Show the latest deterministic pstack route ledger entries",
    handler: async (_args, ctx) => {
      const history = routeHistory(ctx);
      ctx.ui.notify(history.length > 0 ? history.join("\n") : "No pstack route ledger entries exist in this session.", "info");
    },
  });

  pi.registerTool(defineTool({
    name: "pstack_followup",
    label: "Pstack Follow-up",
    description: "Continue one completed owner route through its retained pi-subagents session and preserve deterministic route evidence.",
    parameters: Type.Object({
      runId: Type.String({ minLength: 1, description: "The completed owner run identifier returned by pstack_launch or a previous pstack_followup." }),
      task: Type.String({ minLength: 1, description: "The complete follow-up task for the retained owner." }),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const status = routeEntry(ctx, params.runId);
      if (!status || status.kind !== "completion") {
        throw new PstackConfigError(`Pstack route '${params.runId}' does not have a terminal completion in the active session.`);
      }
      if (failureFields(status, "routingFailures").length > 0) {
        throw new PstackConfigError(`Pstack route '${params.runId}' cannot continue after a routing failure.`);
      }
      const source = routeLaunch(ctx, params.runId);
      if (!source) throw new PstackConfigError(`Pstack launch '${params.runId}' does not exist in the active session.`);
      if (source.executionRole !== "owner" || source.choices.length !== 1) {
        throw new PstackConfigError(`Pstack route '${params.runId}' is not a scalar owner route.`);
      }
      const observed = Array.isArray(status.observed) ? status.observed.map(observedChild).filter((child) => child !== undefined) : [];
      const childRunId = observed[0]?.runId ?? params.runId;
      onUpdate?.({ content: [{ type: "text", text: `Continue owner model role ${source.modelRole}.` }], details: {} });
      const response = await rpcCall(pi, "spawn", {
        workflowScript: buildFollowupWorkflowScript({
          modelRole: source.modelRole,
          childRunId,
          task: params.task,
        }),
        context: source.context,
        cwd: source.cwd,
        async: true,
        chatProgress: "auto",
      }, signal);
      const runId = extractRunId(response);
      const launch = appendFollowupLaunch(pi, active, source, runId, ctx.sessionManager.getSessionId());
      return {
        content: [{ type: "text", text: `Continued pstack owner route ${params.runId} as ${runId}.\n${formatLaunchText(launch)}` }],
        details: launch,
      };
    },
  }));

  pi.registerTool(defineTool({
    name: "pstack_launch",
    label: "Pstack Launch",
    description: "Resolve one pstack model role, map one execution role to a Pi agent, and launch the child through pi-subagents.",
    parameters: Type.Object({
      modelRole: StringEnum(MODEL_ROLES, { description: "The model-selection role from the pstack configuration." }),
      executionRole: StringEnum(EXECUTION_ROLES, { description: "The behavior role that maps to a Pi execution agent." }),
      task: Type.String({ minLength: 1, description: "The complete task for the child." }),
      modelNumber: Type.Optional(Type.Integer({ minimum: 1, description: "The one-based choice number for a panel model role." })),
      context: Type.Optional(StringEnum(CONTEXT_MODES, { description: "The child context mode. The execution role selects the default." })),
      worktree: Type.Optional(Type.Boolean({ description: "Use one managed worktree for this child." })),
      cwd: Type.Optional(Type.String({ minLength: 1, description: "The target project directory. The current directory is the default." })),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400, description: "The child timeout in seconds." })),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `Resolve ${params.modelRole} for ${params.executionRole}.` }], details: {} });
      const route = await prepareRoute(params, ctx);
      const number = params.modelNumber ?? 1;
      if (number > route.models.length) {
        throw new PstackConfigError(`${route.config.path}: model role '${route.modelRole}' has ${route.models.length} choices; received model number ${number}`);
      }
      if (route.models.length > 1 && params.modelNumber === undefined) {
        throw new PstackConfigError(`Model role '${route.modelRole}' has ${route.models.length} choices. Set modelNumber or use pstack_panel.`);
      }
      const model = route.models[number - 1];
      if (!model) throw new PstackConfigError(`Model role '${route.modelRole}' has no choice ${number}.`);
      const response = await rpcCall(pi, "spawn", {
        workflowScript: buildScalarWorkflowScript({
          modelRole: route.modelRole,
          executionRole: route.executionRole,
          agent: route.agent,
          ...model,
          task: params.task,
          worktree: params.worktree ?? false,
        }),
        chatProgress: "auto",
        context: route.context,
        cwd: route.cwd,
        async: true,
        ...(params.timeoutSeconds ? { timeoutMs: params.timeoutSeconds * 1_000 } : {}),
      }, signal);
      const runId = extractRunId(response);
      const launch = appendLaunch(pi, active, route, runId, [model], params.worktree ?? false);
      return {
        content: [{ type: "text", text: formatLaunchText(launch) }],
        details: launch,
      };
    },
  }));

  pi.registerTool(defineTool({
    name: "pstack_panel",
    label: "Pstack Panel",
    description: "Resolve a pstack panel role and launch every configured model through one pi-subagents workflow.",
    parameters: Type.Object({
      modelRole: StringEnum(MODEL_ROLES, { description: "The panel model role from the pstack configuration." }),
      executionRole: StringEnum(EXECUTION_ROLES, { description: "The shared behavior role for all panel children." }),
      tasks: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: "One complete task for each configured model, in configuration order." }),
      context: Type.Optional(StringEnum(CONTEXT_MODES, { description: "The child context mode. The execution role selects the default." })),
      cwd: Type.Optional(Type.String({ minLength: 1, description: "The target project directory. The current directory is the default." })),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400, description: "The workflow timeout in seconds." })),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `Resolve panel ${params.modelRole} for ${params.executionRole}.` }], details: {} });
      const route = await prepareRoute(params, ctx);
      if (!isPanelModelRole(route.modelRole)) {
        throw new PstackConfigError(`Model role '${route.modelRole}' is scalar. Use pstack_launch.`);
      }
      const workflowScript = buildPanelWorkflowScript({
        modelRole: route.modelRole,
        executionRole: route.executionRole,
        agent: route.agent,
        models: route.models,
        tasks: params.tasks,
      });
      const response = await rpcCall(pi, "spawn", {
        workflowScript,
        context: route.context,
        cwd: route.cwd,
        async: true,
        chatProgress: "auto",
        ...(params.timeoutSeconds ? { timeoutMs: params.timeoutSeconds * 1_000 } : {}),
      }, signal);
      const runId = extractRunId(response);
      const launch = appendLaunch(pi, active, route, runId, route.models, false);
      return {
        content: [{ type: "text", text: formatLaunchText(launch) }],
        details: launch,
      };
    },
  }));
}
