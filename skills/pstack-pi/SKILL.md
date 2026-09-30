---
name: pstack-pi
description: "Pi runtime adapter for poteto-mode. Maps canonical pstack roles and lifecycle protocols to Pi-compatible task agents, batching, isolation, TTL-bounded persisted-session follow-ups, and durable result resources."
---

# pstack on Pi

`poteto-mode` is the sole router. It selects the playbook, canonical role, step order, and lifecycle protocol. This adapter translates those choices to Pi-compatible runtimes. It never selects a playbook, repeats the playbook index, or changes a playbook gate.

While this skill is active, its role map is the specific pstack execution contract. Generic host instructions remain valid outside pstack work.

## Canonical role map

Use the live host's configured names. This reference mapping targets OMP, a
Pi-based runtime; other hosts must substitute their own names through the runtime
contract.

| Canonical role | OMP agent | Contract |
|---|---|---|
| `explorer` | `scout` | Read-only repository reconnaissance, trace reduction, narrow audits. |
| `watcher` | `scout` | Observe one exact generation or external-state transition, then terminate. |
| `planner` | `task` | Technical planning, architecture, decomposition, sequencing, and non-visual design candidates. |
| `designer` | `task` | Visual, interaction, and product-design candidates. |
| `reviewer` | `reviewer` | Independent code, protocol, behavioral, or security review. |
| `researcher` | `task` | Source-verified external library, framework, API, protocol, or version research. |
| `synthesizer` | `reviewer` | Cross-report synthesis, adjudication, and advisory judgment over frozen evidence. |
| `implementer` | `task` | Bounded implementation or test changes with explicit write ownership. |
| `owner` | `task` | One coupled multi-step implementation session. Retention runs through OMP's persisted-session lifecycle (`running → idle → parked → aborted`), not a continuously working child process. See the Long-lived owner protocol below for the capability limits. |
| `mechanical` | `sonic` | Fully specified low-judgment edits. Ambiguity returns to the root. |

The OMP bundled task agents are `scout`, `reviewer`, `security-reviewer`,
`task`, and `sonic`. Project, user, and extension agents may add names to the
live inventory. Treat the live task schema and its agent inventory as authoritative.
Never assume `designer` or `librarian` exists just because a canonical role has
that name.

Every canonical role above maps to an agent name available in the bundled OMP
roster. Preserve the canonical role in the task brief. If a role is not in this
table, stop and report that the adapter has no mapping; do not pass the canonical
label through as a host agent name.

`poteto-agent` and `comment-sicko` are custom compatibility agents for direct named seams in imported skills. A direct compatibility call may use that custom agent name; ordinary canonical routing never does.

### Planning distinction

The imported warning about a built-in planning subagent describes a source-host mechanism that bypassed the skill contract. OMP has no bundled `plan` agent. Canonical `planner` and `designer` work use `task` with a role-specific brief and do not pass source-host subagent fields.

### Security review

Use `security-reviewer` for an independent security lane when it appears in the live inventory. Keep it read-only and separate from ordinary code review when both are required. A later `reviewer` session may synthesize frozen reports; it does not replace the primary security review.

## Task contract

The root coordinator performs every `task` call through the host task facility. A child never calls `task`, starts another child, or asks the user directly. Put `Do not call task or start subagents` under `FORBIDDEN` in every child brief.

Children start without the parent conversation. Every prompt must stand alone. They receive the configured workspace, context files, skills, and approved plan resources supplied by the host.

### One task

When the flat schema is active:

```json
{
  "name": "parser-overflow-worker",
  "agent": "task",
  "solutionSpace": "one self-contained task with explicit acceptance criteria",
  "task": "GOAL\n...\n\nROLE\n...\n\nSCOPE\n...\n\nCONTEXT\n...\n\nACCEPTANCE\n...\n\nVERIFY\n...\n\nTIMEBOX\n...\n\nFORBIDDEN\n...\n\nREPORT\n...\n\nSTANDING\n..."
}
```

When batch mode is active, use a one-item `tasks[]` call instead of inventing a per-call batch switch.

Ordinary single-writer work, shared read-only work, and research alongside one writer do not need a worktree. Concurrent writers require separate actual execution roots or proven non-overlapping write sets; if neither is available, fail closed. Do not add `isolated:false` to express the default. Native isolation is usable only when the live schema exposes it, `task.isolation.enabled` is true, and plan mode is off. `isolated:true` selects a separate workspace, not a Git worktree or filesystem sandbox. See [OMP Task workspace roots](references/runtime.md#omp-task-workspace-roots-v1842) for root assignment, baseline checks, and safe integration.

### Batched panel

Use one batch call for independent participants:

```json
{
  "context": "Shared immutable repository, base SHA, artifacts, constraints, and verification context.",
  "tasks": [
    {
      "name": "candidate-a",
      "agent": "task",
      "solutionSpace": "one independent candidate brief with explicit acceptance criteria",
      "task": "ROLE: planner. Standalone brief for technical architecture candidate A."
    },
    {
      "name": "candidate-b",
      "agent": "task",
      "solutionSpace": "one independent candidate brief with explicit acceptance criteria",
      "task": "ROLE: designer. Standalone brief for product-design candidate B."
    }
  ]
}
```

Each `name` is unique. `context` contains common immutable material. Each item still names its exact role, slice, acceptance criteria, verification, forbidden work, and report contract.

Start every participant in one batch before consuming any verdict. Concurrent writers need separate actual execution roots or proven non-overlapping write sets; fail closed if neither is available. Freeze candidate artifacts before starting reviewers. Freeze reviewer reports before starting a separate synthesizer session.

### Background completion and follow-ups

OMP 18.4.3 Task results may auto-deliver. Record the semantic name, agent ID, and job ID separately; do not assume their identifiers are interchangeable.

- `read proc://` lists caller-owned jobs, services, and registered running-agent references outside jobs; a `running` row can be stale. `read proc://<jobId>` inspects job state/output without consuming delivery; it reports job state, not whether an idle child session remains reusable.
- `wait` takes no IDs. It wakes for an owned Task result or peer message, consumes the events it returns, and may return multiple concurrently settled jobs; use it only when blocked, repeating as needed. Async delivery may arrive without `wait`.
- Read `agent://<agentId>` for the saved Task result; later peer replies do not update it. Read `history://<agentId>` for the full transcript, including follow-ups. A result artifact or on-disk transcript does not prove that the child is executing or can be resumed.
- `write agent://<agentId>` sends a peer message only when OMP peer messaging is available. A delivery receipt is not an acknowledgment or an interrupt to a running tool; the child may handle it after the tool returns or while a shell command is backgrounded to process messages and continues running.
- `write proc://<jobId>/kill` with no content cancels a running owned Task; if the job has settled but its idle registration is retained, the same target may drop that registration while the job row remains `completed`. It is not a checkpoint or rollback: preserve partial work and verify a safe boundary before cancellation. The human-facing Agent Hub is a TUI, not a `hub` tool API.
- A non-isolated Task that finishes without a hard abort normally leaves its agent session idle, whether its work succeeded or failed; an aborted session is terminal. An idle child can receive another `agent://` message in the same session. A parked child may be revived when its persisted reviver and workspace are available. Isolated Task sessions are not reusable.
- If a surface is unavailable, report that capability as unavailable. Do not invent a `hub` operation or infer liveness from result/history artifacts. Resolve prior ownership before starting a fresh Task with a complete handoff; do not create a second writer while the earlier child may still act.
- Never steer a reviewer toward a preferred conclusion.
- Ignore duplicate terminal deliveries and reject stale artifact generations.

A task result is evidence, not completion. The root inspects the artifact and runs verification.

## Capabilities and limits

Map semantics to OMP, not to pstack terminology. A capability that does not exist on OMP must fail closed, not be approximated. The Agent Hub is a human-facing TUI; model-facing control lives in `proc://`, `agent://`, `history://`, and `wait`.

| pstack concept | OMP capability | Mechanism |
|---|---|---|
| spawn (single) | SUPPORTED | `task` flat shape: `{ name, agent, task, solutionSpace, ... }` |
| spawn (panel batch) | SUPPORTED | `task` batch shape: `{ context, tasks[] }` |
| result delivery | SUPPORTED | Auto-delivery as an `async-result`; artifact at `agent://<id>` |
| observe running | PARTIALLY SUPPORTED | `read proc://<jobId>` for job state (a `running` row may be stale); `read history://<id>` for live or parked transcript |
| wait (targeted, ID-bearing) | NOT SUPPORTED | `wait` accepts no IDs; it wakes on the next settled owned job, peer message, or owned-service completion, and may return multiple concurrently settled jobs at once. Use repeated `wait` calls to drain required work, never as an ID-targeted poll. |
| wait (barrier / event) | SUPPORTED (with limits) | Repeated no-arg `wait` while blocked. One 30-minute safety cap, then a still-running snapshot. |
| send to running worker | SUPPORTED (caveats) | `write agent://<id>` peer message. Delivery is not an acknowledgment or interrupt to a running tool; the child may defer until the tool returns, or handle the message while a backgrounded shell continues running. |
| follow-up after completion (idle) | SUPPORTED (TTL-bounded) | Same `write agent://<id>` to the same agent ID reaches the idle session until `task.agentIdleTtlMs` (default 420000 ms) expires. |
| follow-up after completion (parked) | PARTIALLY SUPPORTED | `write agent://<id>` revives a parked agent only when OMP can rebuild its reviver and workspace; transcript discovery alone is not enough. |
| follow-up after abort | NOT SUPPORTED | `aborted` is terminal — a killed generation cannot transition back. |
| follow-up to an isolated Task | NOT SUPPORTED | Isolated Task sessions are torn down at run end (parked without reviver; workspace merged and cleaned). The transcript stays readable at `history://<id>`, but no further `write agent://` reaches a live session. |
| cancel (running job) | SUPPORTED (cooperative only) | `write proc://<jobId>/kill` with no content. The job reports `cancelled`; the child becomes terminal `aborted`. Cancellation is not a checkpoint or rollback — partial tool output and transcripts may remain. |
| cancel (idle registration) | SUPPORTED (caveats) | Killing a retained idle registration may release that session while its job row stays `completed`; after the row is reaped, the target returns not-found. |
| long-lived owner (continuous live process) | NOT SUPPORTED | OMP has no always-on child process. A child transitions `running → idle → parked → aborted`. There is no equivalent of a long-lived worker that keeps polling or executing between root messages. |
| long-lived owner (same persisted session across idle/parked) | PARTIALLY SUPPORTED | `write agent://<id>` to an idle session; same to a parked session when revival succeeds. Subject to idle TTL, peer-messaging availability, and revival conditions. |
| long-lived owner (new child reading prior transcript) | SUPPORTED | Fresh `task` call with a complete handoff; the prior transcript lives at `history://<oldId>`. |
| hub (TUI roster) | SUPPORTED (human-facing only) | Agent Hub opens through `Alt+A` / `Ctrl+S` / double-tap ←. It is a TUI roster and control surface, not a `hub` tool API. |
| hub (programmatic) | NOT SUPPORTED | Use `proc://`, `agent://`, `history://`, and `wait` directly. No umbrella `hub` tool API. |
| live child status (registry) | NOT DIRECTLY EXPOSED | Status (`running`, `idle`, `parked`, `aborted`) is registry-internal. Use `read proc://<jobId>` for job state and `read history://<id>` for the rendered transcript; treat both as evidence subject to the staleness rules, not as authoritative liveness. |

`SUPPORTED` means the runtime can do this directly. `PARTIALLY SUPPORTED` means the runtime can do it under documented conditions (TTL, peer-messaging availability, isolated-mode, etc.). `NOT SUPPORTED` means the runtime cannot do this; do not invent a host tool or assume pstack terminology survives translation. `NOT DIRECTLY EXPOSED` means the underlying state exists but no host surface exposes it directly; use the listed proxy surfaces with their documented caveats.

Fail closed on every NOT SUPPORTED row. Do not invent a host tool name or assume pstack terminology survives translation. When peer messaging is unavailable, the `write agent://` surface fails; resolve prior ownership and start a fresh Task with a complete handoff instead.

## Brief shape

A dispatch is forbidden until its brief contains:

**GOAL**  
One-sentence outcome executable by a stranger.

**ROLE**  
The canonical role, mapped OMP agent, authority, and expected stance.

**SCOPE**  
Writable and non-writable paths, exact slice or race arm, worktree and branch where applicable, and every output path. State the one-writer assignment.

**CONTEXT**  
Repository root, relevant source paths, base SHA, frozen artifacts, active skill and playbook paths, settled assumptions, and known gotchas.

**ACCEPTANCE**  
Checkable observable outcomes, one per line.

**VERIFY**  
Exact commands, fixtures, runtime probes, comparison baselines, environment requirements, and known false-positive or false-negative risks.

**TIMEBOX**  
A rough cap. At the cap, return partial evidence and stop instead of broadening scope.

**FORBIDDEN**  
At minimum: no child task calls; no subagent spawning; no out-of-scope fixes; no unrequested migrations; no shared-path edits outside ownership; no merge; no direct user questions; no completion claim without executed verification.

**REPORT**  
Require `PASS | ISSUES | BLOCKED`, semantic session name, branch and exact SHAs where applicable, verdict and evidence, changed files or artifacts, actual verification commands and results, deviations, unresolved risks, and parent actions.

**STANDING**  
Copy the active playbook's standing policy text verbatim when it supplies one.

## Canonical protocols

### Bounded session

1. Author one standalone brief.
2. Start one task with the mapped agent.
3. Record its semantic name, agent ID, job ID, role, scope, isolation mode, base SHA, and expected artifact. Agent ID and job ID are separate identifiers; do not assume they are interchangeable.
4. Consume the async result when delivered; use no-argument `wait` only when blocked. A settled result moves the child from `running` to `idle` (or `aborted` on hard failure). The result artifact at `agent://<agentId>` is now frozen.
5. Read `agent://<agentId>` for the saved result artifact; inspect `history://<agentId>` for the full transcript including any follow-up replies. Neither proves current liveness; both can outlive the child.
6. Send one bounded `write agent://<agentId>` correction only when peer messaging is available and only while the unit is still actionable: a still-running child that has not yet yielded, or an idle child whose idle TTL has not yet expired. Do not rely on delivery as an interrupt to a running tool — the child may handle it after the tool returns. Once the child yields and the result auto-arrives, the unit is closed; further work routes through a fresh task or through the [Long-lived owner](#long-lived-owner) protocol. For an idle child past its TTL, route the next unit through the Long-lived owner protocol or start a fresh Task with a complete handoff.
7. Inspect the artifact and independently run the promised verification.
8. Accept the unit only after the parent verifies the reported output.

A role or unit change requires a fresh task.

### Panel

1. Partition independent slices or race arms with one task per participant.
2. Start every participant in one batch before consuming any result.
3. Track participants by semantic name and identifiers, never arrival order.
4. Track each returned job ID; let results auto-deliver and use repeated no-argument `wait` calls only while blocked. A single `wait` may return multiple concurrently settled jobs or peer messages at once; consume every event it returns and account for every required participant. `wait` cannot select IDs; do not poll for a single participant's completion by calling `wait` repeatedly. Record every cancellation or gap explicitly. Use `write proc://<jobId>/kill` only to abort a stale job after checking its safe boundary.
5. Ignore duplicate terminal delivery.
6. Freeze implementation artifacts, branches, head SHAs, reports, and hashes.
7. Start every independent reviewer in a new batch only after the candidates are frozen.
8. Freeze verdicts before starting a separate `reviewer` when synthesis is needed.
9. Treat synthesis as advice. The root selects and verifies.

Do not mix implementers, reviewers, or synthesizers in one session. Do not let reviewers race a moving head.

### Long-lived owner

OMP supports three distinct retention models; the protocol name collapses them only because each is the closest equivalent to pstack's "long-lived owner". They are not interchangeable.

- **Same live process** is NOT SUPPORTED. There is no always-on child process. The owner session oscillates between `running`, `idle`, and `parked`. Do not promise the root that the owner is continuously executing between root messages.
- **Same persisted session** is PARTIALLY SUPPORTED. A non-isolated Task that finishes without a hard abort leaves its agent session `idle` (live) for `task.agentIdleTtlMs` (default 420000 ms in v18.4.3); on expiry it parks (live session disposed, ref + sessionFile retained). A parked child revives only when OMP can rebuild its reviver and workspace. Discovery of the transcript alone is not enough.
- **New child reading prior transcript** is SUPPORTED. A fresh `task` call with a complete handoff reads `history://<oldId>` for prior context. This is the durable substitute when the persisted session is gone or unavailable.

Protocol:

1. Start one non-isolated `task` session with the complete owner brief. Do not use `isolated: true` — isolated Task sessions are not reusable.
2. Record its agent ID and job ID separately; use the agent ID for follow-up and the job ID for process control, even if they match. The semantic name is the role's working identity; treat the agent ID as the persisted-session identifier; treat the job ID as the per-spawn process handle. A settled Task moves the child from `running` to `idle` (or `aborted` on hard failure); it is never a continuously working child.
3. The owner works only in its assigned branch and paths and never starts children.
4. Send a `write agent://<agentId>` follow-up only for the next coupled phase, an in-scope correction, an evidence-based answer, or explicit authorization, and only while OMP peer messaging is available. Follow-ups reach `idle` and revivable `parked` sessions; they do not reach `aborted` or `isolated` sessions, and they are not a tool interrupt while a child is mid-turn. If the unit has aborted, or peer messaging is unavailable, resolve prior ownership and start a fresh Task with a complete handoff instead.
5. OMP's configured idle TTL parks the session. A parked child may revive through `write agent://<agentId>` only when its persisted reviver and workspace are available; otherwise reconcile that the old child is quiescent and capture its partial state before starting a fresh Task with a complete handoff. Isolated Task sessions are not reusable.
6. Require a terminal report at each verification boundary.
7. Independently verify the boundary before authorizing the next phase.
8. Stand down on ownership violation, stale generation, or terminal scope breach.

### One-shot watcher

1. Start one background `scout` task.
2. Put the exact branch, head SHA, generation, watched predicate, stop predicate, and timebox in the brief.
3. Require one meaningful event and a terminal report.
4. Discard a report whose generation no longer matches.
5. Start a fresh watcher for each new generation.
6. Stand down when the stop predicate is met or the work is superseded.

A watcher observes. It does not fix, merge, authorize, or silently follow a changed head.

## Interactions and decisions

Children resolve uncertainty from source, standing policy, frozen evidence, or the brief. Otherwise they use the safest reversible interpretation and report the assumption, or return `BLOCKED` with the exact missing decision and evidence gathered.

The root resolves a child question by sending the answer through `write agent://<agentId>` only when OMP peer messaging is available and only for an `idle` or revivable `parked` child. Delivery is not a tool interrupt and is not proof the child handled the message. If peer messaging is unavailable, the child has aborted, or the session is `isolated`, use a fresh Task only after the previous child is quiescent and its partial state is reconciled, or handle the decision at the root; never invent a `hub` send operation, never rely on `agent://` or `history://` presence as proof of liveness, and never describe a settled result as a live worker.

## Ownership and verification

- One writer per branch and mutable state; concurrent writers may share a root only with proven non-overlapping write sets.
- Separate sessions own implementation, review, judgment, and synthesis.
- A task stays inside its assigned unit and role.
- Concurrent writers need separate actual execution roots or proven non-overlapping write sets; fail closed if neither is available.
- A worker's report never verifies its own work.
- Record branch, base SHA, and exact head SHA or artifact generation.
- Prefer behavioral proof over type-check-only evidence.
- A new commit, restack, conflict resolution, or applied patch creates a new generation that voids the prior verdict.
- Judges and synthesizers advise. The root owns selection, user interaction, external writes, merges, deletion, and final truth.
- Claim model independence only from each child's persisted resolution and invocation evidence. Configured aliases alone do not prove it.

## Model routing

OMP resolves each child model from `task.agentModelOverrides`, the agent
definition, and its configured task/session fallback. `modelRoles` resolves
documented aliases in those settings. Agent selection and model selection are
separate decisions.

Do not put a `model` field in a task item. Do not use a model alias as the `agent`
value. Treat `.omp/config.yml` as expected routing, not proof of execution. Report
actual model usage from the child's persisted session JSONL; never let the child's
self-report override `model_change`, fallback metadata, or invocation records. Use
the [OMP child model provenance procedure](references/runtime.md#omp-child-model-provenance).

Recommended model-role aliases for the bundled OMP agents:

| OMP agent | Recommendation |
|---|---|
| `scout` | `@smol` |
| `reviewer` | `@advisor` |
| `security-reviewer` | `@advisor` |
| `task` | `@task` or a stronger implementation role |
| `sonic` | `@tiny` or `@smol` |

These are configuration recommendations, not task payload fields. Roles mapped
to the same OMP agent share the same model override.

## Writing

Apply `unslop` to every reply, brief, report, review, task dispatch, commit message, and agent-facing edit.
