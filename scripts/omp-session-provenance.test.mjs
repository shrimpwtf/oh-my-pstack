import assert from "node:assert/strict";
import test from "node:test";

import { inspectOmpSessionProvenance } from "./omp-session-provenance.mjs";

const session = [
  { type: "session", id: "child-session" },
  {
    type: "model_change",
    role: "default",
    model: "openai-codex/gpt-6-astra",
    resolvedModelIsFallback: false,
  },
  {
    type: "model_change",
    role: "subagent:reviewer",
    model: "openai-codex/gpt-6-astra",
    resolvedModelIsFallback: false,
  },
  {
    type: "model_usage",
    purpose: "auto-thinking",
    role: "judge",
    provider: "openai-codex",
    model: "gpt-6-luna",
  },
  {
    type: "message",
    message: {
      role: "assistant",
      provider: "openai-codex",
      model: "gpt-6-astra",
      content: [{ type: "text", text: "I cannot determine my model." }],
      usage: { input: 10, output: 2 },
    },
  },
  {
    type: "message",
    message: {
      role: "assistant",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "Another invocation." }],
    },
  },
  {
    type: "message",
    message: {
      role: "assistant",
      provider: "openai-codex",
      model: "gpt-6-astra",
      content: [{ type: "text", text: "The first model returns." }],
    },
  },
].map((entry) => JSON.stringify(entry)).join("\n");

test("reads resolved and invoked models from persisted child session events", () => {
  const result = inspectOmpSessionProvenance(session);

  assert.deepEqual(
    result.resolved.map(({ role, model, fallback }) => ({ role, model, fallback })),
    [
      {
        role: "default",
        model: "openai-codex/gpt-6-astra",
        fallback: false,
      },
      {
        role: "subagent:reviewer",
        model: "openai-codex/gpt-6-astra",
        fallback: false,
      },
    ],
  );
  assert.deepEqual(
    result.assistantMessages.map(({ provider, model }) => ({ provider, model })),
    [
      { provider: "openai-codex", model: "gpt-6-astra" },
      { provider: "anthropic", model: "claude-sonnet-4-5" },
      { provider: "openai-codex", model: "gpt-6-astra" },
    ],
  );
  assert.deepEqual(
    result.modelUsage.map(({ purpose, role, provider, model }) => ({
      purpose,
      role,
      provider,
      model,
    })),
    [
      {
        purpose: "auto-thinking",
        role: "judge",
        provider: "openai-codex",
        model: "gpt-6-luna",
      },
    ],
  );
});

test("does not fabricate runtime models when session has no provenance", () => {
  const result = inspectOmpSessionProvenance(
    JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "I cannot determine my model." }],
      },
    }),
  );

  assert.deepEqual(result, {
    resolved: [],
    assistantMessages: [],
    modelUsage: [],
  });
});

test("preserves fallback true without inferring it from model differences", () => {
  const result = inspectOmpSessionProvenance(
    [
      {
        type: "model_change",
        model: "openai-codex/gpt-6-astra",
        resolvedModelIsFallback: true,
      },
      {
        type: "message",
        message: {
          role: "assistant",
          provider: "anthropic",
          model: "claude-sonnet-4-5",
        },
      },
    ].map((entry) => JSON.stringify(entry)).join("\n"),
  );

  assert.equal(result.resolved[0].fallback, true);
  assert.equal(result.assistantMessages[0].model, "claude-sonnet-4-5");
});

test("keeps resolved evidence when invocation metadata is absent", () => {
  const result = inspectOmpSessionProvenance(
    JSON.stringify({
      type: "model_change",
      role: "subagent:reviewer",
      model: "openai-codex/gpt-6-astra",
      resolvedModelIsFallback: false,
    }),
  );

  assert.equal(result.resolved[0].model, "openai-codex/gpt-6-astra");
  assert.deepEqual(result.assistantMessages, []);

  const invocationOnly = inspectOmpSessionProvenance(
    JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        provider: "openai-codex",
        model: "gpt-6-astra",
      },
    }),
  );
  assert.deepEqual(invocationOnly.resolved, []);
  assert.equal(invocationOnly.assistantMessages[0].model, "gpt-6-astra");
});

test("preserves unknown fallback state and rejects malformed JSONL with its line", () => {
  const result = inspectOmpSessionProvenance(
    JSON.stringify({ type: "model_change", model: "openai-codex/gpt-6-astra" }),
  );
  assert.equal(result.resolved[0].fallback, null);
  assert.throws(
    () => inspectOmpSessionProvenance('{"type":"session"}\nnot-json'),
    /line 2/u,
  );
  assert.throws(
    () => inspectOmpSessionProvenance("null"),
    /entry object at line 1/u,
  );
});
