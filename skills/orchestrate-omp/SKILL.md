---
name: orchestrate-omp
description: "Coordinate OMP subagents on substantial work. Use when parallel discovery, specialist review, or clearly partitioned implementation will shorten or strengthen the result; skip trivial tasks."
---

# Orchestrate on OMP

Stay available to the user while substantive work runs behind the scenes. The root coordinator owns the plan, user interaction, approvals, scope, integration, and final verification.

## 1. Frame

1. State the done predicate and the final artifact or decision.
2. Split only independent discovery, specialist review, or implementation with clear ownership. Keep tightly coupled work in one session.
3. Assign distinct primary ownership and name shared contracts before dispatch. Do not duplicate investigations or serialize a useful batch merely to avoid possible file overlap.
4. Keep external side effects and approval decisions with the root.

## 2. Choose Agents

Use the exact names exposed by the live `task` tool; its inventory is authoritative. For the current OMP roster:

| Work | Agent | Effort when exposed |
|---|---|---|
| Narrow read-only codebase discovery | `scout` | `lo` |
| Routine scoped implementation | Omit `agent` for the default worker | `med` |
| Difficult or ambiguous implementation | Omit `agent` for the default worker | `hi` |
| Mechanical edits or data collection | `sonic` | `lo` |
| UI/UX implementation or review | `designer` | `med` or `hi` |
| Code-quality verdict | `reviewer` | `med` or `hi` |
| Security verdict | `security-reviewer` | `hi` |
| External library or API research | `librarian` | `lo` or `med` |

When the live task schema exposes `effort`, match it to the assignment: `lo` for narrow questions, `med` for routine work, and `hi` when ambiguity or consequence justifies it. Otherwise rely on the selected agent's configured model role; do not pass an unavailable field.

Honor read-only and blocking markers in the live inventory. Never pass the default worker's name explicitly.

## 3. Dispatch

1. When the live schema exposes `tasks[]`, put independent participants in one batch so they start together and structure shared `context` as `Goal`, `Constraints`, and `Contract`. Otherwise start one participant per task call without passing `context`.
2. Give every item a stable CamelCase `name` of at most 32 characters, the most specific specialist `agent` when one fits, and a complete standalone `task`. Omit `agent` only for the default worker. Add `effort` only when the live schema exposes it.
3. Structure each assignment as `Target`, `Change`, and `Acceptance`. Include essential repository state, decisions, restrictions, and dependencies because children start without conversation history.
4. Give every writer an exact writable scope. Concurrent writers need separate actual execution roots or proven non-overlapping write sets. Use `isolated:true` only when the live schema exposes it and native isolation is enabled; inspect returned metadata and verify the child root and reported patch/branch state.
5. Tell ordinary workers: `Complete this assignment directly. Do not call task or spawn subagents.` Allow nested delegation only when the assignment explicitly makes that worker a coordinator.
6. Tell workers to skip project-wide formatting, linting, and test suites. The root runs shared validation once after integration.

Large context belongs in a local file referenced with `local://<path>`, not duplicated across assignments.

### Workspace roots and concurrent writes

Ordinary single-writer work, shared read-only work, and research alongside one
writer do not require worktrees. Concurrent writers require genuinely separate
execution roots or proven non-overlapping write sets; if neither is available,
stop rather than dispatch writers against a shared checkout.

For OMP v18.4.2, a Task's cwd comes from the parent session unless native Task
isolation is selected. Creating a worktree with `omp worktree add` does not rebind
the parent session or a later Task; relative file-tool paths follow the child
session root. `isolated:true` is usable only when the live Task schema exposes it
and `task.isolation.enabled` is true (and plan mode is off). It provides separate
workspace roots, not an OS filesystem sandbox: do not assume containment for
absolute paths, `..`, symlinks, or external effects.

Record the parent root and base SHA before dispatch. When a child session log is
available, verify its `cwd` and `parentSession`; also verify the child's Git
root and `HEAD`, and the actual paths resolved by relative file-tool calls.
Treat returned patch and branch paths as result artifacts, not workspace roots.

Before dispatch, capture the parent baseline:

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
parent changes unexpectedly, stop and preserve the evidence. Do not auto-revert.
Before a no-auto-apply check, set `task.isolation.apply: false` in OMP settings.
This is a setting, not a Task item field; its default is `true`. Inspect returned
patch/branch metadata and integrate deliberately.
Child cwd/root evidence comes from a persisted
session header when available, plus runtime path checks, never from result
artifact paths such as `local://` or `agent://`.

Use `outputSchema` only when the coordinator needs a machine-readable result. Set `schemaMode: "strict"` when invalid output must fail rather than return with a warning.

## 4. Coordinate

- Results auto-deliver. Continue handling user messages and independent root work instead of polling continuously.
- Use `write agent://<id>` for a bounded sibling message only when OMP peer messaging is available, only for an `idle` or revivable `parked` child, and only while the unit is still actionable. A delivery receipt is not an acknowledgment, an immediate interrupt, or proof the child handled the message. Follow-ups do not reach `aborted` or `isolated` sessions; resolve prior ownership and start a fresh Task with a complete handoff instead.
- OMP `wait` takes no IDs and wakes for the next owned Task result or peer message, consuming returned events; a single `wait` may return multiple concurrently settled jobs. Results may auto-deliver; call `wait` only when blocked and repeat to drain required work, but never as an ID-targeted poll.
- Use `read proc://` or `read proc://<jobId>` for background-job status/output. A completed job row is not proof that the child session still exists; a listed `running` registration may also be stale. Use `read history://<id>` for the rendered transcript; neither file presence nor history timestamps prove current liveness.
- Use `write proc://<jobId>/kill` with no content only to abort an owned job after checking its safe boundary. Cancellation is not a checkpoint or rollback; preserve partial work before killing. OMP has no `hub` tool API; `agent://<id>` is the saved Task result and later replies remain in `history://<id>`, a transcript rather than live execution evidence. See the [OMP Task lifecycle contract](../pstack-pi/references/runtime.md#omp-task-lifecycle-and-interaction-v1843) and the [capability matrix](../pstack-pi/SKILL.md#capabilities-and-limits) for what OMP actually supports.

## 5. Integrate

1. Drain every required participant or record the cancellation or gap.
2. Inspect each claimed artifact and reconcile conflicts against the declared ownership and contracts.
3. Run the affected validation and real user path from the root at the integrated head.
4. Return one concise result with agent identifiers, accepted findings or changes, verification evidence, and unresolved gaps.

Claim model or backend diversity only when returned metadata proves it.
