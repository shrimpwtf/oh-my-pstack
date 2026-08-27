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

When the live task schema exposes `effort`, match it to the assignment: `lo` for narrow questions, `med` for routine work, and `hi` when ambiguity or consequence justifies it. Otherwise rely on the selected agent's configured model; do not pass an unavailable field.

Honor read-only and blocking markers in the live inventory. Never pass the default worker's name explicitly.

## 3. Dispatch

1. When the live schema exposes `tasks[]`, put independent participants in one batch so they start together and structure shared `context` as `Goal`, `Constraints`, and `Contract`. Otherwise start one participant per task call without passing `context`.
2. Give every item a stable CamelCase `name` of at most 32 characters, the most specific specialist `agent` when one fits, and a complete standalone `task`. Omit `agent` only for the default worker. Add `effort` only when the live schema exposes it.
3. Structure each assignment as `Target`, `Change`, and `Acceptance`. Include essential repository state, decisions, restrictions, and dependencies because children start without conversation history.
4. Give every writer an exact writable scope. When the live schema exposes `isolated`, use `isolated: true` for concurrent writers that need separate workspaces, then inspect the returned metadata to learn whether changes were applied or retained as artifacts.
5. Tell ordinary workers: `Complete this assignment directly. Do not call task or spawn subagents.` Allow nested delegation only when the assignment explicitly makes that worker a coordinator.
6. Tell workers to skip project-wide formatting, linting, and test suites. The root runs shared validation once after integration.

Large context belongs in a local file referenced with `local://<path>`, not duplicated across assignments.

Use `outputSchema` only when the coordinator needs a machine-readable result. Set `schemaMode: "strict"` when invalid output must fail rather than return with a warning.

## 4. Coordinate

- Results auto-deliver. Continue handling user messages and independent root work instead of polling continuously.
- Siblings may exchange concise dependency updates through OMP IRC. Name expected dependencies in shared context so communication is purposeful rather than discovery by negotiation.
- Use the live job-control surface only to wait for required work, inspect status, send a bounded correction, or cancel stale work.
- Read complete results from `agent://<id>` and use `history://<id>` when a report is incomplete or suspicious.
- A completed job means the child yielded successfully. It does not mean its artifact is accepted.

## 5. Integrate

1. Drain every required participant or record the cancellation or gap.
2. Inspect each claimed artifact and reconcile conflicts against the declared ownership and contracts.
3. Run the affected validation and real user path from the root at the integrated head.
4. Return one concise result with agent identifiers, accepted findings or changes, verification evidence, and unresolved gaps.

Claim model or backend diversity only when returned metadata proves it.
