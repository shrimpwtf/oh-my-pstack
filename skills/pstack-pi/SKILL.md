---
name: pstack-pi
description: "Pi runtime adapter for pstack. Keeps original pstack model roles separate from execution agents and maps lifecycle protocols to Pi-compatible child runs."
---

# pstack on Pi

`poteto-mode` is the sole workflow router. It selects the playbook, pstack model role, execution role, step order, and lifecycle protocol.

This adapter translates those choices to the active child runtime. It does not collapse pstack model roles into agent defaults.

## Independent role systems

Model roles and execution roles are independent.

A pstack model role selects the child model for one workflow step. Examples include `feature`, `bug-fix`, `how explorer`, and `interrogate reviewers`.

An execution role selects the child behavior, tools, permissions, context policy, and lifecycle protocol.

The same execution agent can serve several pstack model roles. Each launch still receives the exact configured model for its model role.

## Execution role map

The model role remains the visible run identity. The Pi runtime profile is a private capability detail.

| Execution roles | Private Pi profile | Tool contract |
| --- | --- | --- |
| `explorer`, `watcher`, `planner`, `designer`, `reviewer`, `synthesizer` | `pstack-runtime-read` | Read-only files and shell verification. |
| `researcher` | `pstack-runtime-evidence` | Files, shell history, MCP evidence, and web sources. |
| `implementer`, `owner`, `mechanical` | `poteto-agent` | Bounded file changes and verification. |

Each profile declares a strict tool list. `pi-subagents` verifies that list before the first model turn.

OMP can map the same execution roles to its available capability profiles.

Runtime profile selection never selects the pstack model role.

## Model role routing

On Pi, use `pstack_launch` for one child. Use `pstack_panel` for all entries in one panel role.

The tools read `$PSTACK_CONFIG` when set. Otherwise, they read `.pstack/config.md` from the target project.

The router expands both shared upstream labels. It resolves the exact model role from the active workflow.

The router performs these operations for each choice:

1. Parse the base model, thinking level, and `[fast]` marker.
2. Verify the base model against the live inventory.
3. Select the execution agent from the independent execution role.
4. Pass the complete model through the per-run `model` field.
5. Pass fast mode through the separate `fast` field.
6. Record the requested route in the Pi session ledger.
7. Record the observed child data after completion.

The router resolves `inherit-parent` and `auto` to the active parent model and thinking level. It then passes that concrete value per run.

If the model role is absent, stop the dispatch. If the model is unavailable, stop the dispatch. Do not use an agent default.

A panel value contains one entry per child. The same execution agent can serve each model perspective.

Do not write model or effort values to host agent settings. The pstack configuration remains the model policy.

## Child contract

The root coordinator starts every child. A child never starts another child or asks the user directly.

Every child receives a standalone brief. The router adds the model role, workflow name, role prompt, execution role, model, and fast state.

The visible run label uses the model role. The private runtime profile remains in the route ledger for audits.

For one Pi child, call `pstack_launch`:

```json
{
  "modelRole": "bug-fix",
  "executionRole": "implementer",
  "task": "GOAL\n...\n\nSCOPE\n...\n\nACCEPTANCE\n...\n\nVERIFY\n...\n\nFORBIDDEN\n...\n\nREPORT\n...",
  "context": "fork",
  "worktree": true
}
```

For a Pi panel, call `pstack_panel`:

```json
{
  "modelRole": "how critics",
  "executionRole": "reviewer",
  "tasks": [
    "Review the frozen architecture against the supplied rubric.",
    "Review the frozen architecture against the supplied rubric.",
    "Review the frozen architecture against the supplied rubric.",
    "Review the frozen architecture against the supplied rubric."
  ],
  "context": "fresh"
}
```

The returned run identifier belongs to `pi-subagents`. Use `subagent_wait` or the `subagent` status action. Then call `pstack_status`. Accept the result only when success is true and both failure lists are empty.

Use a managed worktree for a writer that needs isolated files. Use a fresh context for independent review and cross-provider children. Use retained context only for one coupled owner.

## Brief shape

A dispatch is forbidden until its brief contains these sections.

**Goal.** State one outcome that a stranger can execute.

**Model role.** Name the exact pstack configuration key and selected choice.

**Execution role.** Name the behavior role, mapped host agent, authority, and expected stance.

**Scope.** Name writable paths, read-only paths, branch, worktree, and output path. Assign one writer.

**Context.** Name the repository root, source paths, base SHA, frozen artifacts, settled assumptions, and known risks.

**Acceptance.** List observable outcomes.

**Verify.** Give exact commands, fixtures, probes, baselines, and environment requirements.

**Timebox.** Set a rough cap. Require a partial evidence report at the cap.

**Forbidden.** Forbid child delegation, out-of-scope fixes, unrequested migrations, shared-path edits, merges, direct user questions, and unverified completion claims.

**Report.** Require `PASS`, `ISSUES`, or `BLOCKED`. Require the model role, resolved model, effort, branch, SHA, changed files, commands, results, deviations, and residual risks.

**Standing policy.** Copy the active playbook policy when it supplies one.

## Lifecycle protocols

### Bounded session

1. Resolve the model role.
2. Select the execution role.
3. Author one standalone brief.
4. Call `pstack_launch` with the model role, execution role, and brief.
5. Record the returned run ID, role pair, scope, base SHA, and expected artifact.
6. Read the complete result and transcript when required.
7. Call `pstack_status` with the returned run ID.
8. Reject a route with false success or a nonempty failure list.
9. Inspect the artifact and run parent verification.
10. Accept the unit only after the parent verifies it.

A model role, execution role, or unit change starts a fresh child.

### Panel

1. Resolve the panel model role.
2. Create one task per configured entry.
3. Select one shared execution role for `pstack_panel`.
4. Call `pstack_panel` to start every participant concurrently.
5. Track participants by stable key, model, and run ID.
6. Wait for every required result or cancel it explicitly.
7. Call `pstack_status` before result acceptance.
8. Reject a result with a mismatched model or stale generation.
9. Freeze candidate artifacts before starting judges.
10. Freeze judge reports before synthesis.
11. Treat synthesis as advice. The root selects and verifies.

Do not mix writers, reviewers, or synthesizers in one child session. Do not let a reviewer inspect a moving head.

### Long-lived owner

1. Resolve the model role once.
2. Call `pstack_launch` once with the `owner` execution role and complete brief.
3. Record its run ID.
4. After each terminal report, call `pstack_followup` with that run ID and the complete follow-up brief.
5. Replace the recorded run ID with the new run ID from `pstack_followup`.
6. Keep the owner inside its assigned branch and paths.
7. Require a terminal report at each verification boundary.
8. Verify each boundary before the next follow-up.
9. Stop on ownership violation, stale generation, or model drift.

### One-shot watcher

1. Resolve the watcher model role when the workflow defines one.
2. Call `pstack_launch` with the `watcher` execution role.
3. Put the exact branch, SHA, generation, predicate, and timebox in the brief.
4. Require one meaningful event and a terminal report.
5. Reject a stale generation or model mismatch.
6. Start a fresh watcher for each new generation.

A watcher observes. It does not fix, merge, or authorize.

## Interactions and decisions

Children resolve uncertainty from source, standing policy, frozen evidence, or the brief.

If evidence cannot resolve an ambiguity, use the safest reversible interpretation and report it. Return `BLOCKED` when the missing decision prevents safe work.

The root answers child questions through the host control channel. Ask the user only for product preference, unavailable authority, or an uncovered irreversible action.

## Ownership and verification

- Assign one writer per branch, worktree, mutable state, and output path.
- Separate implementation, review, judgment, and synthesis sessions.
- Isolate concurrent writers unless outputs are structurally disjoint.
- Treat a child report as evidence, not proof.
- Record the branch, base SHA, head SHA, and artifact generation.
- Prefer behavior proof over type checks.
- Treat a new commit, restack, or applied patch as a new generation.
- Reject a configured model role result when runtime fallback changes the model.
- Keep user interaction, external writes, merges, deletion, and final truth at the root.

## Writing

Apply `unslop` to every brief, report, review, task dispatch, commit message, and agent-facing edit.
