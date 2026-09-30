import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

async function readMarkdown(...segments) {
  return await readFile(join(repo, ...segments), "utf8");
}

function assertNoMatch(source, pattern, message) {
  const match = source.match(pattern);
  assert.equal(match, null, `${message} (unexpected match: ${JSON.stringify(match?.[0] ?? match)})`);
}

function extractCapabilityRows(source, headingPattern) {
  const heading = source.match(headingPattern);
  if (!heading) return [];
  const tail = source.slice(heading.index + heading[0].length);
  const sectionEnd = tail.search(/\n##\s|\n###\s(?![\s\S]*Capability)/u);
  const slice = sectionEnd > 0 ? tail.slice(0, sectionEnd) : tail;
  const lines = slice.split(/\r?\n/u);
  const headerLabels = new Set(["pstack concept", "capability"]);
  const rows = [];
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const label = cells[1];
    const status = cells[2];
    if (!label || !status) continue;
    if (/^[-:\s]+$/u.test(label)) continue;
    if (headerLabels.has(label.toLowerCase())) continue;
    rows.push([label, status]);
  }
  return rows;
}

test("pstack-pi exposes an explicit capability matrix", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(skill, /##\s+Capabilities and limits/u, "pstack-pi SKILL.md is missing the Capabilities and limits section");
  assert.match(skill, /\|\s*spawn\b/u, "capability matrix must enumerate spawn rows");
  assert.match(skill, /\|\s*wait\b/u, "capability matrix must enumerate wait rows");
  assert.match(skill, /\|\s*follow-up\b/u, "capability matrix must enumerate follow-up rows");
  assert.match(skill, /\|\s*cancel\b/u, "capability matrix must enumerate cancel rows");
  assert.match(skill, /\|\s*long-lived owner\b/u, "capability matrix must enumerate long-lived owner rows");
  assert.match(skill, /NOT SUPPORTED/u, "capability matrix must mark at least one row NOT SUPPORTED to fail closed");
  assert.match(skill, /PARTIALLY SUPPORTED/u, "capability matrix must mark at least one row PARTIALLY SUPPORTED");
  assert.match(skill, /SUPPORTED/u, "capability matrix must mark at least one row SUPPORTED");
});

test("pstack-pi capability matrix carries the four-status legend", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(skill, /`SUPPORTED`\s+means/u, "pstack-pi must define what SUPPORTED means");
  assert.match(skill, /`PARTIALLY SUPPORTED`\s+means/u, "pstack-pi must define what PARTIALLY SUPPORTED means");
  assert.match(skill, /`NOT SUPPORTED`\s+means/u, "pstack-pi must define what NOT SUPPORTED means");
  assert.match(skill, /`NOT DIRECTLY EXPOSED`\s+means/u, "pstack-pi must define what NOT DIRECTLY EXPOSED means");
});

test("pstack-pi capability matrix exposes the hub rows", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  const matrix = skill.match(/##\s+Capabilities and limits[\s\S]*?(?=\n##\s|\n*$)/u)?.[0] ?? "";
  assert.match(matrix, /\|\s*hub\s*\(TUI\s+roster\)/u, "pstack-pi matrix must enumerate the hub (TUI roster) row");
  assert.match(matrix, /\|\s*hub\s*\(programmatic\)/u, "pstack-pi matrix must enumerate the hub (programmatic) row");
});

test("pstack-pi and runtime.md capability matrices agree on every status cell", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  const runtime = await readMarkdown("skills", "pstack-pi", "references", "runtime.md");
  const pstackRows = extractCapabilityRows(skill, /##\s+Capabilities and limits/u);
  const runtimeRows = extractCapabilityRows(runtime, /###\s+Capability matrix/u);
  assert.ok(pstackRows.length >= 12, "pstack-pi matrix must have substantive rows");
  assert.ok(runtimeRows.length >= 12, "runtime.md matrix must have substantive rows");

  const buildIndex = (rows) => {
    const index = new Map();
    for (const [label, status] of rows) {
      index.set(label.toLowerCase(), status);
    }
    return index;
  };

  const pstackIndex = buildIndex(pstackRows);
  const runtimeIndex = buildIndex(runtimeRows);

  for (const [label, status] of pstackIndex) {
    if (!runtimeIndex.has(label)) continue;
    assert.equal(
      runtimeIndex.get(label),
      status,
      `runtime.md matrix row "${label}" status differs from pstack-pi (${runtimeIndex.get(label)} vs ${status})`,
    );
  }

  for (const [label, status] of runtimeIndex) {
    if (!pstackIndex.has(label)) continue;
    assert.equal(
      pstackIndex.get(label),
      status,
      `pstack-pi matrix row "${label}" status differs from runtime.md (${pstackIndex.get(label)} vs ${status})`,
    );
  }

  // Catch label-only divergence: any label in one matrix that is missing from the other.
  const pstackLabels = new Set(pstackIndex.keys());
  const runtimeLabels = new Set(runtimeIndex.keys());
  const missingInRuntime = [...pstackLabels].filter((l) => !runtimeLabels.has(l));
  const missingInPstack = [...runtimeLabels].filter((l) => !pstackLabels.has(l));
  assert.deepEqual(
    missingInRuntime,
    [],
    `runtime.md matrix is missing these pstack-pi row labels: ${missingInRuntime.join(", ")}`,
  );
  assert.deepEqual(
    missingInPstack,
    [],
    `pstack-pi matrix is missing these runtime.md row labels: ${missingInPstack.join(", ")}`,
  );
});

test("pstack-pi does not promise a hub tool API", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assertNoMatch(skill, /\bhub\b\s+(tool|api|operation|surface)\b/u, "skill must not advertise a hub tool API");
  assertNoMatch(skill, /use\s+`?hub\b/iu, "no instruction may tell the agent to call a hub tool");
  assert.match(skill, /not\s+a\s+`?hub`?\s+tool\s+API/u, "skill must explicitly deny a hub tool API");
});

test("pstack-pi tells agents never to send an ID to wait", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(skill, /`wait`\s+takes\s+no\s+IDs?/u, "skill must say `wait` takes no IDs");
  assert.match(skill, /`wait`\s+cannot\s+select\s+IDs?/u, "skill must say `wait` cannot select IDs");
  assertNoMatch(skill, /`wait`[^`]*\bid\b/u, "no instruction may pass an id-like field to wait");
});

test("pstack-pi distinguishes running, idle, parked, aborted states together", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  const combined = /`?running`?\s*[\s\S]{0,40}→[\s\S]{0,40}idle[\s\S]{0,40}→[\s\S]{0,40}parked[\s\S]{0,40}→[\s\S]{0,40}aborted/u;
  assert.match(
    skill,
    combined,
    "skill must depict the four lifecycle states running → idle → parked → aborted as a coordinated diagram",
  );
});

test("pstack-pi describes long-lived owner retention explicitly", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(skill, /not\s+a\s+continuously\s+working\s+child/u, "long-lived owner must say it is not a continuously working child");
  assert.match(skill, /isolated[^.\n]*not\s+reusable/u, "skill must say isolated Task sessions are not reusable");
  assert.match(
    skill,
    /(?:Do not use|avoid|never\s+(?:set|enable|use))\b[^.\n]*`?isolated:?\s*true`?/iu,
    "long-lived owner protocol must forbid `isolated: true` in some form",
  );
});

test("pstack-pi explicitly fails closed on unsendable follow-ups", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(skill, /follow-ups?\s+after\s+abort[^.\n]*NOT\s+SUPPORTED/u, "skill must say follow-ups after abort are NOT SUPPORTED");
  assert.match(skill, /follow-ups?\s+to\s+an\s+isolated\s+Task[^.\n]*NOT\s+SUPPORTED/u, "skill must say follow-ups to isolated Tasks are NOT SUPPORTED");
  assert.match(skill, /resolve\s+prior\s+ownership[^.\n]*complete\s+handoff/u, "skill must direct the root to start a fresh Task with a complete handoff");
});

test("pstack-pi does not treat agent:// or history:// as proof of liveness", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(
    skill,
    /Read\s+`agent:\/\/<agentId>`\s+for\s+the\s+saved\s+(?:Task\s+result|result\s+artifact)/u,
    "skill must say agent:// is the saved result (either phrasing)",
  );
  assert.match(skill, /Read\s+`history:\/\/<agentId>`\s+for\s+the[^.\n]*transcript/u, "skill must say history:// is a transcript");
  assert.match(skill, /(?:does\s+not\s+prove|Neither\s+proves)[^.\n]*live/u, "skill must explicitly say neither resource proves liveness");
});

test("pstack-pi describes cancellation as non-checkpoint", async () => {
  const skill = await readMarkdown("skills", "pstack-pi", "SKILL.md");
  assert.match(skill, /not\s+a\s+checkpoint\s+or\s+rollback/u, "skill must describe cancellation as not a checkpoint or rollback");
});

test("runtime.md carries a capability matrix that matches pstack-pi", async () => {
  const runtime = await readMarkdown("skills", "pstack-pi", "references", "runtime.md");
  assert.match(runtime, /###\s+Capability matrix/u, "runtime.md must include a `### Capability matrix` sub-section");
  const matrix = runtime.match(/###\s+Capability matrix[\s\S]*?(?=\n##\s|\n*$)/u)?.[0] ?? "";
  assert.ok(matrix.length > 200, "Capability matrix section must contain a real table");
  assert.match(matrix, /NOT SUPPORTED/u, "runtime.md capability matrix must mark rows NOT SUPPORTED");
  assert.match(matrix, /PARTIALLY SUPPORTED/u, "runtime.md capability matrix must mark rows PARTIALLY SUPPORTED");
  assert.match(runtime, /NOT DIRECTLY EXPOSED/u, "runtime.md capability matrix must include the NOT DIRECTLY EXPOSED legend entry");
});

test("orchestrate-omp does not promise a hub tool API", async () => {
  const skill = await readMarkdown("skills", "orchestrate-omp", "SKILL.md");
  assertNoMatch(skill, /\bhub\b\s+(tool|api|operation|surface)\b/u, "orchestrate-omp must not advertise a hub tool API");
  assert.match(skill, /no\s+`?hub`?\s+tool\s+API/u, "orchestrate-omp must explicitly deny a hub tool API");
  assert.match(skill, /capability\s+matrix/u, "orchestrate-omp must link to the capability matrix");
});

test("orchestrate-omp never promises an ID-targeted wait", async () => {
  const skill = await readMarkdown("skills", "orchestrate-omp", "SKILL.md");
  assert.match(skill, /`wait`\s+takes\s+no\s+IDs?/u, "orchestrate-omp must say `wait` takes no IDs");
  assert.match(skill, /never\s+as\s+an\s+ID-targeted\s+poll/u, "orchestrate-omp must forbid using wait as an ID-targeted poll");
});

test("poteto-mode playbooks link long-lived owner to the capability matrix", async () => {
  for (const path of [
    ["skills", "poteto-mode", "playbooks", "autopilot-full.md"],
    ["skills", "poteto-mode", "playbooks", "autopilot-stack.md"],
    ["skills", "poteto-mode", "playbooks", "orchestrate.md"],
    ["skills", "poteto-mode", "playbooks", "visual-parity.md"],
  ]) {
    const text = await readMarkdown(...path);
    assert.match(
      text,
      /capability\s+matrix/u,
      `${path.join("/")} must reference the capability matrix for long-lived owner retention limits`,
    );
  }
});

test("shared playbooks keep owner lifecycle conditional on adapter capabilities", async () => {
  for (const path of [
    ["skills", "poteto-mode", "playbooks", "autopilot-full.md"],
    ["skills", "poteto-mode", "playbooks", "autopilot-stack.md"],
    ["skills", "poteto-mode", "playbooks", "orchestrate.md"],
    ["skills", "poteto-mode", "playbooks", "visual-parity.md"],
  ]) {
    const text = await readMarkdown(...path);
    assert.match(text, /capability\s+matrix/u, `${path.join("/")} must defer owner lifecycle to the adapter's capability matrix`);
    assertNoMatch(
      text,
      /retention (?:is|uses) the active adapter's persisted-session lifecycle, not a continuously working process/u,
      `${path.join("/")} must not assert OMP's session lifecycle as a universal contract`,
    );
  }
});
test("autopilot playbooks delegate wait semantics to the active adapter", async () => {
  for (const path of [
    ["skills", "poteto-mode", "playbooks", "autopilot-full.md"],
    ["skills", "poteto-mode", "playbooks", "autopilot-stack.md"],
  ]) {
    const text = await readMarkdown(...path);
    assert.match(text, /active adapter's documented wait and live-status contract/u);
    assert.match(text, /do not use waiting as a substitute for current-state evidence/u);
    assertNoMatch(
      text,
      /`wait` is an event wait|not a per-owner liveness poll/u,
      `${path.join("/")} must not impose OMP wait semantics on every host`,
    );
  }
});

test("shared playbooks do not embed OMP control syntax", async () => {
  for (const path of [
    ["skills", "poteto-mode", "playbooks", "autopilot-full.md"],
    ["skills", "poteto-mode", "playbooks", "autopilot-stack.md"],
    ["skills", "poteto-mode", "playbooks", "orchestrate.md"],
    ["skills", "poteto-mode", "playbooks", "visual-parity.md"],
    ["skills", "poteto-mode", "playbooks", "worktree-cleanup.md"],
    ["skills", "poteto-mode", "playbooks", "pause-safely.md"],
  ]) {
    const text = await readMarkdown(...path);
    assertNoMatch(
      text,
      /\bOMP\b|proc:\/\/|agent:\/\/|history:\/\/|isolated:true/u,
      `${path.join("/")} must leave OMP control syntax to the adapter`,
    );
  }
});