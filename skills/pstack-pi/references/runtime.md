# Portable pstack runtime contract

This file is the host-neutral binding for the imported pstack skills. Read it before
using any instruction that mentions a task runner, model, transcript, question tool,
skill path, or long-running loop.

## Host selection

Use an explicit host identity supplied by the active runtime, when available. Never
identify the current host from `command -v` or the presence of a CLI executable:
those only show installation, not which agent owns the current session. Do not
infer host identity from undocumented environment variables. If the active runtime
does not identify itself, report the host as unknown and use only capabilities
verified from the live tool inventory.

For OMP, the task tool's live agent inventory is authoritative. The bundled OMP
task agents are `scout`, `reviewer`, `security-reviewer`, `task`, and `sonic`;
project, user, and extension agents can add names. Never treat a canonical pstack
role as a host agent name without applying the OMP mapping.

When a capability is unavailable, preserve the workflow gate and use the nearest
truthful local equivalent. Do not claim a child, review, transcript, or live check
happened unless the host reported it.

## Canonical roles

| pstack role | Required behavior |
| --- | --- |
| `explorer` | Read-only repository reconnaissance and trace reduction. |
| `watcher` | Observe one exact state transition, then terminate. |
| `planner` | Technical architecture, decomposition, and sequencing. |
| `designer` | Product, interaction, or alternative design candidates. |
| `reviewer` | Independent code, protocol, behavioral, or security review. |
| `researcher` | Source-verified external documentation and API research. |
| `synthesizer` | Adjudicate frozen reports without changing their evidence. |
| `implementer` | Bounded implementation or test changes with explicit ownership. |
| `owner` | One coupled implementation session retained through its lifecycle. |
| `mechanical` | Fully specified low-judgment edits. |

Map these roles using the live host's agent or task names. OMP's bundled task
agents are `scout`, `reviewer`, `security-reviewer`, `task`, and `sonic`.
Project, user, and extension agents may add names. The live inventory wins.
The OMP adapter maps `explorer` and `watcher` to `scout`, `reviewer` and
`synthesizer` to `reviewer`, implementation and general roles to `task`, and
low-judgment mechanical work to `sonic`. `planner`, `designer`, and `researcher`
map to `task` with their canonical role preserved in the brief. Do not pass
canonical role labels directly as agent names. Stop if a canonical role has no
adapter mapping. Claude Code and Codex may expose different names.

Every child brief must stand alone. It must name its goal, role, writable scope,
acceptance criteria, verification command, forbidden scope, and report format. A
child does not spawn another child unless the host explicitly supports nested
delegation and the active playbook requires it.

## Models

Model inventory is not model delegation. A host may list models that the current
conversation can use without exposing any task or subagent facility that can send
a child to one of those models. Native Pi has this boundary: `pi --list-models`
and `/model` select the single active conversation model, while Pi does not
include built-in subagents.

For native Pi, install the maintained `pi-subagents` package when per-role models
or parallel children are required:

```bash
pi install npm:pi-subagents
```

Restart Pi and run `/subagents-doctor`. Once the `subagent` tool is visible,
configure its `subagents.agentOverrides` in `.pi/settings.json`. The package's
built-in agents map to pstack roles as follows: `scout` for `explorer` and
`watcher`, `researcher` for `researcher`, `worker` for `implementer` and
`mechanical`, `reviewer` for `reviewer`, `oracle` for planning and synthesis, and
`delegate` for an `owner`.

Use concrete `provider/model-id` values only when the host exposes per-child model
selection and the value was confirmed in the live inventory. Use role aliases only
when the host explicitly documents a role-to-model mapping. `inherit-parent` means
the current conversation's model only when the host can pass it to a child. A
missing role entry means the host default. A panel is a list of role or model
choices, and its size controls fan-out.

When the host has models but no child delegation, do not write a role mapping that
looks active. Report the capability gap and tell the user to switch Pi's single
active model with `/model` or `pi --model provider/model-id`. Workflow skills still
run on that active model, but panel and child-agent behavior is unavailable unless
the user installs a host extension or uses a different runtime that provides it.

The optional configuration path is `$PSTACK_CONFIG`. If it is unset, use
`.pstack/config.md` in the current project for project-local settings. Do not write
to a vendor-specific home directory unless the host explicitly asks for it.

## OMP child model provenance

Report configured, resolved, and invoked models as separate facts. Child self-report
is not runtime evidence.

| Evidence | Source | Meaning |
|---|---|---|
| Configured | `.omp/config.yml` `task.agentModelOverrides`, agent definition, or `modelRoles` | Expected routing only. It does not prove that a child ran or which model it invoked. |
| Resolved | Child session JSONL `model_change` and `resolvedModelIsFallback` | The model OMP resolved for that child session, with fallback state when recorded. |
| Invoked | Assistant `message.provider` and `message.model`; `model_usage` with `purpose` and `role` | Assistant message metadata identifies each invocation. Keep auxiliary usage records separate. |
| Self-reported | Child text | A claim by the child. Never use it to override persisted runtime evidence. |

After an OMP Task finishes:

1. Record the child task ID returned by `task`.
2. Locate the matching `<task-id>.jsonl` in the parent's session artifact directory. The
   filename uses the task ID, such as `ProvenanceChild.jsonl`. Read its session header
   and confirm `parentSession` points to the parent session file. For `/path/parent.jsonl`,
   the artifact directory is `/path/parent/`. A parent without a persisted session may
   use a temporary artifact directory.
3. Inspect every `model_change` entry in order. Preserve its `role`, `model`, and
   `resolvedModelIsFallback`. If fallback metadata is absent, report it as unknown,
   never as `false`. A role-specific entry such as `subagent:<task-id>` identifies
   the child assignment.
4. Inspect each `model_usage` entry and keep its `purpose` and `role`. Inspect
   assistant `message` entries for `provider`, `model`, and `usage`.
5. Report assistant invocation models in chronological order. Keep repeated entries
   when the model changes away and back. Summarize one model only when every
   invocation agrees. Keep auxiliary `model_usage` calls separate.
6. Compare the configured selector, resolved entries, and invocation records. Do
   not infer fallback from a difference between configured and invoked values.

The test-only JSONL fixture in `scripts/omp-session-provenance.test.mjs` covers these
entry types, missing fields, auxiliary usage, and model transitions. The workflow
still reads the persisted child session as its runtime evidence.

When only configuration is available, report `resolved: unavailable`,
`invoked: unavailable`, and `fallback: unknown`. If the JSONL lacks a particular
event type, report only that field as unavailable and retain other observed
provenance. If the child JSONL cannot be located or contains no model evidence,
report `unavailable`; do not substitute `.omp/config.yml`, Task's textual output,
or the child's self-report.

When reporting model routing, use a compact record with `phase`, `agent`,
`canonical role`, `configured`, `resolved`, `invoked`, `fallback`, and `evidence`.
Keep every model transition when a child used more than one invocation model.
Do not require every workflow to print a provenance table.

OMP refreshes task routing settings before each Task spawn. A prior controlled
same-parent test confirmed that changing `task.agentModelOverrides` applies to
subsequently spawned children. This does not claim that OMP reloads every setting
or changes an already running child.

## Questions and interaction

Use the host's structured user-interaction tool when it exists. Otherwise ask one
focused question in the normal conversation. Never invent a vendor-specific question
tool name.
An observable fact belongs to a probe or verification run, not a user question.

## Skills and paths

Invoke skills by their host-supported name, normally `/skill:<name>` or `$name`.
Read a skill with the host's resource reader using `skill://<skill-name>`. For a
file under that skill, use `skill://<skill-name>/<relative-path>`. The first path
segment is always the actual skill name, not the name of the currently active
skill. Resolve relative Markdown links against the file that contains them; do
not turn a relative path into a URI prefixed with the active skill name.
A Python REPL's `%load` loads source into Python; it does not invoke a skill.
Use the host's skill invocation or resource reader instead of passing a skill URI
to `%load`.

Within this package, sibling files are under `skills/<name>/`. Do not use a
vendor-specific plugin path or assume a global installation path.

OpenCode's native Agent Skills loader looks in `.opencode/skills/` for a project or
`~/.config/opencode/skills/` globally. When installing this repository for
OpenCode, copy the contents of this package's `skills/` directory into one of
those locations. OpenCode loads a skill on demand through its native `skill`
tool; it does not automatically scan an arbitrary cloned repository directory.
OpenCode's built-in primary and subagents are the delegation surface. Use the
host's `opencode.json` or `opencode.jsonc` model configuration and live agent
inventory rather than assuming Pi's `pi-subagents` settings apply.

## Transcripts and history

Transcript-dependent skills accept an explicit transcript directory or host history
resource. Prefer `$PSTACK_TRANSCRIPTS_DIR` when the host does not expose a history
resource. Never scan another project or a global vendor transcript tree. If no
transcript source is available, report the gap and continue only with evidence that
does not require it.

## OMP session recovery (v18.4.3)

OMP persists root sessions as JSONL journals. The session header's `id` identifies
the conversation; its `cwd` identifies the starting directory, not a saved Git
branch or worktree.

- Use `omp --resume <session-id-or-jsonl-path>` when the exact prior conversation
  is known. This reopens that journal and its recorded conversation state.
- Use `omp --continue` for the current terminal's last session, falling back to
  the most recent session for the current cwd. A bare launch is not recovery when
  `autoResume` is disabled; it creates a new root. Prefer an exact ID over
  recency-based selection for a known interrupted session.
- Reuse a custom `--session-dir` when the journal was stored there. Keep the
  journal path or ID in a project-accessible recovery note; a fresh root's
  `local://` artifacts are not automatically visible to another root.
- `/handoff` is an OMP TUI command that compacts the current journal in place and
  retains a recent tail; it does not create a new session. By default it writes no
  standalone checkpoint. `compaction.handoffSaveToDisk` optionally writes a
  `handoff-*.md` file. The separate `handoff` skill writes a recovery note; it does
  not invoke OMP's `/handoff`.
- A resumed journal is context, not proof of current repository state. Before
  acting, verify the actual Git root, branch, `HEAD`, status, changed files, and
  side effects. OMP does not restore an old worktree or external process merely
  by reopening its journal.
- Task child journals are separate from the parent. A saved child transcript or
  result artifact does not prove that its process is still running or can be
  resumed; inspect live job state and persisted output/patch evidence separately.

For a new root that must reconstruct pstack work, use the actual playbooks
`skill://poteto-mode/playbooks/pause-safely.md` and
`skill://poteto-mode/playbooks/session-pickup.md`. They preserve a durable,
workspace-scoped trail; they do not make OMP discover or resume an old root automatically.
`history://` indexes registered agents and discovered on-disk child transcripts; it
is not a catalog of root OMP sessions or evidence that a child is currently active.

## Long-running work and verification

Use the host's durable goal, watcher, or loop facility when available. Otherwise keep
the predicate and checkpoint in a project-local decision trail. A timed heartbeat is
only a fallback. Re-arm a watcher after every state-changing wave.

The root coordinator owns user interaction, approvals, integration, and final
verification. A worker report is evidence, not proof. The root must inspect artifacts
and run the promised checks on the integrated result.

## OMP Task workspace roots (v18.4.2)

In the checked OMP v18.4.2 runtime, a Task's cwd comes from the parent session
unless native isolation is selected. Creating an OMP worktree does not rebind the
parent session or a later Task; relative file-tool paths follow the child session
root. A result path such as `local://...` or `agent://...` is an artifact channel,
not evidence of the child's cwd or source root.

The Task API has no caller-supplied cwd or existing-worktree path. `isolated:true`
creates an OMP-managed temporary root from the parent repository at dispatch.
Record the task ID and parent root/HEAD. When a child session log is available,
verify its `cwd` and `parentSession`, the child's Git root/HEAD, and actual
resolved file-tool paths before accepting changes. Treat returned patch/branch
paths as result artifacts, not workspace roots.

Native `isolated:true` is available only when the live Task schema exposes it and
`task.isolation.enabled` is true, with plan mode off. It separates workspace roots;
it is not a Git worktree or OS filesystem sandbox, and does not promise containment
for absolute paths, `..`, symlinks, or external effects. To keep a verification
run from auto-applying successful isolated changes, set
`task.isolation.apply: false` in OMP settings. This is a setting, not a Task item
argument; its default is `true`. Inspect returned patch or branch metadata and
integrate deliberately.

Single writers may use the current checkout; shared read-only work and research
alongside one writer need no worktree. Concurrent writers require separate actual
execution roots or proven non-overlapping write sets. If neither is available,
fail closed rather than dispatching writers into a shared checkout.

Before dispatch, capture this parent baseline:

```bash
git rev-parse --show-toplevel
git rev-parse HEAD
git status --porcelain=v1 --untracked-files=all
git diff --binary HEAD | git hash-object --stdin
```

Repeat and compare all four outputs after children finish. The digest covers
tracked content, including dirty files; status lists untracked paths, not their
content. Git status and diff omit ignored files and external state. Preserve or
fingerprint any untracked or ignored/generated path the child may touch. If the
parent changes unexpectedly, stop and preserve the evidence; do not auto-revert.

## OMP Task lifecycle and interaction (v18.4.3)

The `task` tool accepts a batch with shared `context` and per-item `task` and `solutionSpace`. With `async.enabled: true`, it returns child/job identifiers and delivers each result asynchronously. Record the semantic name, agent ID, and job ID independently; equal strings in one run do not make them the same identifier.

- `wait` has no ID parameter. It wakes on an owned Task result or peer message, consumes the events it returns, and may return multiple concurrently settled jobs; it can also be interrupted. Results may instead auto-deliver. Use it only when blocked, and repeat it to drain required work; do not use it as an ID-targeted poll.
- `read proc://` lists caller-owned background jobs, services, and registered running-agent references outside jobs; a `running` row may be stale. `read proc://<jobId>` reports that job's current state/output without consuming delivery. It reports job state, not the continued existence or readiness of the child session; a retained `completed` job row can outlive the child.
- `read agent://<agentId>` reads the saved Task-result artifact; later peer replies do not update it. `read history://<agentId>` reads the transcript, including follow-ups; the no-argument `history://` index lists registered or on-disk agents. An artifact or transcript can survive after the child is gone; `on disk`, `parked`, and `aborted` are not running work. Use actual live status, not file presence or history timestamps, for liveness.
- OMP's Agent Hub is a human-facing TUI roster and control surface, not a `hub` tool API. For model-facing control, use the native `proc://`, `agent://`, `history://`, and `wait` surfaces. If the host surface cannot establish state, report it as unknown rather than infer it.

`write agent://<agentId>` sends a peer message when peer messaging is available. A successful delivery receipt does not prove that the child read or answered it. The child may defer handling it until a tool returns; OMP can also background a long-running shell command and let the child handle the message while that command continues. Neither behavior interrupts arbitrary work or guarantees a safe zero-writes hold. Peer-messaging availability is derived from the active session and Task depth, not a `task.peerMessaging.enabled` setting.

A non-isolated Task that finishes without a hard abort leaves its agent session `idle`, whether its work succeeded or failed; job status and session lifecycle are separate. A hard-aborted session is terminal. An idle session can receive a follow-up through `write agent://<agentId>`. OMP's default `task.agentIdleTtlMs` is 420000 ms; an idle session then becomes `parked` and its live session is disposed. A parked session may revive from its persisted transcript when OMP can rebuild its reviver and workspace. Discovery of a transcript alone does not prove revival is possible. `isolated:true` Task sessions are not reusable.

`write proc://<jobId>/kill` with no content cancels a running owned Task job: the job reports `cancelled` and the child session becomes terminal `aborted`. A kill routed to a retained idle registration may instead release that session while its job row remains `completed`; after the row is reaped, the model-facing target returns not-found. A running agent outside a job can be targeted with `write proc://<agentId>/kill`. Cancellation is not a checkpoint or rollback: tool output and transcripts may retain partial work, while the result artifact may be absent or partial. Inspect and preserve side effects before cancellation. The human Agent Hub can release a selected idle agent with `x`.

If peer messaging is unavailable in the sender's session, `write agent://` fails; an unknown or aborted recipient also fails, and a missing or reaped process ID returns not-found instead of falling back to another API. Keep the state unknown, preserve existing artifacts, and resolve prior ownership before starting a fresh Task with a complete handoff.

### Capability matrix (semantic, not command-shaped)

| Capability | Status | Authoritative mechanism | Notes |
|---|---|---|---|
| spawn (single) | SUPPORTED | `task` flat shape | returns `details.async.jobId` + `details.progress[0].id` when `async.enabled=true` |
| spawn (panel batch) | SUPPORTED | `task` batch shape `{ context, tasks[] }` | `context` required, per-item `agent` and `task` and `solutionSpace` |
| result delivery | SUPPORTED | auto-delivered `async-result` + `agent://<id>` artifact | full output at `agent://<id>`; preview at `details.results[].output` |
| observe running | PARTIALLY SUPPORTED | `read proc://<jobId>` for job state; `read history://<id>` for transcript | job state may be stale; transcript presence is not liveness |
| wait (targeted, ID-bearing) | NOT SUPPORTED | `wait` accepts no IDs | use repeated `wait` while blocked; account for every settled participant |
| wait (barrier / event) | SUPPORTED (with limits) | no-arg `wait`, 30-minute safety cap | returns "Nothing to wait for" when no owned work |
| send to running worker | SUPPORTED (caveats) | `write agent://<id>` peer message | delivery ≠ acknowledgment; not a tool interrupt; long-running shell can run while message is handled |
| follow-up after completion (idle) | SUPPORTED (TTL-bounded) | `write agent://<id>` reaches idle agent | default `task.agentIdleTtlMs = 420000` ms |
| follow-up after completion (parked) | PARTIALLY SUPPORTED | `write agent://<id>` revives parked agent | revival requires a rebuildable reviver + workspace |
| follow-up after abort | NOT SUPPORTED | `aborted` is terminal | delayed work from killed generation cannot transition back |
| follow-up to an isolated Task | NOT SUPPORTED | isolated Task sessions torn down at run end | transcript readable via `history://<id>`; no live session |
| cancel (running job) | SUPPORTED (cooperative only) | `write proc://<jobId>/kill` no content | job → `cancelled`; child → `aborted`; not a checkpoint/rollback; child mid-shell may not honor the kill promptly |
| cancel (idle registration) | SUPPORTED (caveats) | same kill target on idle row | may release session while row stays `completed`; later returns not-found |
| long-lived owner (continuous live process) | NOT SUPPORTED | no always-on child process | status oscillates `running → idle → parked → aborted` |
| long-lived owner (same persisted session across idle/parked) | PARTIALLY SUPPORTED | `write agent://<id>` revives when conditions hold | subject to peer messaging, idle TTL, revival success |
| long-lived owner (new child reading prior transcript) | SUPPORTED | fresh `task` with full handoff; `history://<oldId>` for context | the durable substitute when persisted session is gone |
| hub (TUI roster) | SUPPORTED (human-facing only) | Agent Hub Alt+A / Ctrl+S / double-tap ← | not a `hub` tool API |
| hub (programmatic) | NOT SUPPORTED | use `proc://`, `agent://`, `history://`, `wait` directly | no umbrella `hub` tool API |
| live child status (registry) | NOT DIRECTLY EXPOSED | registry status `running \| idle \| parked \| aborted` is internal | use `proc://`/`history://` as evidence with caveats |

`SUPPORTED` means the runtime can do this directly. `PARTIALLY SUPPORTED` means the runtime can do it under documented conditions (TTL, peer-messaging availability, isolated-mode, etc.). `NOT SUPPORTED` means the runtime cannot do this; do not invent a host tool or assume pstack terminology survives translation. `NOT DIRECTLY EXPOSED` means the underlying state exists but no host surface exposes it directly; use the listed proxy surfaces with their documented caveats.

## OMP v18.4.3 contract sources

- [Task tool](https://github.com/can1357/oh-my-pi/blob/v18.4.3/docs/tools/task.md), [wait tool](https://github.com/can1357/oh-my-pi/blob/v18.4.3/docs/tools/wait.md), and [Agent Hub](https://github.com/can1357/oh-my-pi/blob/v18.4.3/docs/agent-hub.md).
- Runtime protocols: [`proc://`](https://github.com/can1357/oh-my-pi/blob/v18.4.3/packages/coding-agent/src/internal-urls/proc-protocol.ts), [`agent://`](https://github.com/can1357/oh-my-pi/blob/v18.4.3/packages/coding-agent/src/internal-urls/agent-protocol.ts), [`history://`](https://github.com/can1357/oh-my-pi/blob/v18.4.3/packages/coding-agent/src/internal-urls/history-protocol.ts), [`wait`](https://github.com/can1357/oh-my-pi/blob/v18.4.3/packages/coding-agent/src/tools/wait.ts), and [agent lifecycle](https://github.com/can1357/oh-my-pi/blob/v18.4.3/packages/coding-agent/src/registry/agent-lifecycle.ts).
