---
name: setup-pstack
description: Configure which host-supported roles or models pstack uses per workflow role. Detects the live host inventory and writes portable project-local configuration. Use for /setup-pstack, "configure pstack models", or changing pstack's role choices.
---

# Setup pstack

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) throughout this setup.

Write the optional pstack configuration at `$PSTACK_CONFIG` when that variable is set; otherwise use `.pstack/config.md` in the current project. This is an override layer, not a requirement. Never write to a vendor-specific home directory.

## Steps

Model discovery, host identity, and model assignment are separate capabilities.
Do not identify the active host by checking whether `pi`, `opencode`, `codex`, or
another executable is on `PATH`. Use an explicit runtime identity when the host
provides one. Otherwise report the host as unknown and inspect only the live
capabilities available in this session.

A model listed by a host is available to the current runtime, but that does not
mean a child can select it. Per-child assignment may use a model field on each
task item or a documented setting that selects a model by child agent name. Do
not require a task-item `model` field when the host documents another routing
mechanism.

For OMP, the task payload has no per-item `model` field. Its documented
`task.agentModelOverrides` setting provides per-agent model selection. When the
active task interface and live agent inventory match OMP's task contract, run
`omp models --json` and `omp config list --json` before deciding that model
inventory or child selection is unavailable. A listed `task.agentModelOverrides`
setting is the supported selector even when its current value is `{}`. Confirm
each chosen model against the model inventory. If either command fails, report
the exact unavailable capability; do not infer that OMP lacks model routing just
because the task item has no model field or the override map is empty.

OMP model overrides are per host agent name, not per canonical pstack role. Roles
that map to the same OMP agent share its model selection. Do not claim distinct
role models for roles mapped to the same agent.

### Pi delegation prerequisite

For native Pi, recommend the maintained `pi-subagents` package when the user wants
parallel workers or per-role models:

```bash
pi install npm:pi-subagents
```

Tell the user to restart Pi after installation, then run `/subagents-doctor`.
Continue setup only when the `subagent` tool and the expected agents are visible.
The package supplies the delegation facility; it does not choose pstack's model
policy by itself.

### OpenCode delegation prerequisite

OpenCode has its own native primary and subagent agents. Do not install
`pi-subagents` or write Pi-specific settings when the current host is OpenCode.
Use the agents and concrete `provider/model-id` choices reported by OpenCode, and
keep their model configuration in the host's `opencode.json` or
`opencode.jsonc`. If OpenCode does not expose a usable subagent, report that
limitation instead of substituting a Pi-specific mechanism.

### 1. Detect available choices

Detect these independently:

1. The model IDs the current host actually exposes.
2. Whether the current host exposes a task or subagent facility that can select a
   model for each child.
3. The host's live agent inventory and the mapping from canonical pstack roles.

For Pi, `pi --list-models` is the model inventory and the `provider/model-id` form
is the concrete value to record. With `pi-subagents` installed, the `subagent`
tool and `/subagents-doctor` establish the delegation inventory. The live host
inventory is authoritative. Never copy a vendor slug from prose or guess that a
model is available.

For OMP, use `omp models --json` for the model inventory and the live task tool
schema for task and agent capability. The bundled agent names are `scout`,
`reviewer`, `security-reviewer`, `task`, and `sonic`; project, user, and extension
agents may add names. Task items select an agent, not a model. OMP selects child
models through `task.agentModelOverrides`, agent definitions, and `modelRoles`.
Do not infer OMP support from an executable on `PATH`.

If the host has a task facility but cannot enumerate models, use only a host role
mapping that the facility documents. Do not ask the user to invent a raw slug.
`inherit-parent` is valid only when the host can pass the current model to a child.

### 2. Load current state

Read the selected configuration path when it exists and treat its concrete values
as current choices. If it contains only portable role aliases from a host without
per-child delegation, treat those aliases as stale inactive state and start from
the detected models instead of carrying them into Pi's agent overrides.

### 3. Map and confirm

If model inventory and per-child selection are both available, show the detected
model IDs and live child agent names before asking for role choices. Map roles
through the runtime adapter. For OMP, roles routed to one agent share one model
override; collapse those roles to one choice and explain the shared assignment.
Do not write assignments for roles whose host agent is missing.

If the host exposes models but no task or subagent facility, stop model mapping
with an explicit capability report. For native Pi, recommend
`pi install npm:pi-subagents`, a restart, and `/subagents-doctor`. For OpenCode,
explain that its native agents are not visible or configured and point the user
to the host's agent configuration. For any other host, name the missing
capability without proposing a vendor-specific substitute. Say that no pstack
role can receive a different model in this session and do not present the
portable defaults as an assignment or overwrite an existing role configuration
with inactive aliases.


For panel roles (`how critics`, `arena runners`, `arena cross-judge pool`, `architect runners`, and `interrogate reviewers`), one child runs per entry, so list length controls fan-out. Prefer diversity for judgment-sensitive panels. `swarm workers` is the default choice for every worker unless a race assigns a different choice per arm.

### 4. Validate

Every explicit model written must be present in the detected host inventory.
Role aliases pass only when the host task facility documents those aliases.
`inherit-parent` passes only when the host can pass the current model to a child. If
a selected explicit model is unavailable, stop and ask for a replacement. Never
write a configuration that requires another host.

### 5. Write the configuration

When the host supports per-child selection, create the parent directory when
needed and overwrite the selected file so re-runs remain idempotent. Use concrete
detected model IDs in this shape. Replace every placeholder with a model the
current host reported, and use `inherit-parent` only when the host supports it:

```md
# pstack role and model configuration
# Values are concrete provider/model-id choices confirmed by the host.
feature, refactoring: <implementer-model>
bug-fix: <reviewer-model>
perf-issue: <reviewer-model>
hillclimb: <implementer-model>
judgment and prose: <reviewer-model>
hardest tasks: inherit-parent
how explorer: <explorer-model>
how explainer: <synthesizer-model>
how critics: <reviewer-model>, <planner-model>, <designer-model>, inherit-parent
why investigators: <researcher-model>
why synthesizer: <synthesizer-model>
reflect tooling: <researcher-model>
reflect judgment: <reviewer-model>
reflect divergent: <designer-model>
reflect synthesizer: <synthesizer-model>
arena runners: <designer-model>, <planner-model>, <implementer-model>, inherit-parent
arena cross-judge pool: <reviewer-model>, <planner-model>, <designer-model>, inherit-parent
swarm workers: <implementer-model>
architect runners: <designer-model>, <planner-model>, <reviewer-model>, inherit-parent
interrogate reviewers: <reviewer-model>, <planner-model>, <designer-model>, inherit-parent
```

For OMP, also write the selected concrete IDs to the project's `.omp/config.yml`
under `task.agentModelOverrides`, keyed by the live OMP agent names. Preserve all
unrelated settings. Do not write a task-item `model` field. Roles that map to the
same OMP agent must use the same model choice. `.pstack/config.md` records the
portable workflow preferences; it does not activate OMP model routing by itself.

```yaml
task:
  agentModelOverrides:
    scout: <explorer-model>
    reviewer: <reviewer-model>
    security-reviewer: <reviewer-model>
    task: <implementer-model>
    sonic: <mechanical-model>
```

Only include agents present in the live inventory and models confirmed by the
host. Configure `security-reviewer` with the selected review model when both
review lanes should share it. OMP does not inherit the `reviewer` override for
another agent name.

For Pi with `pi-subagents`, also preserve unrelated keys and update the project's
`.pi/settings.json` with the concrete model assignments for the discovered
subagent names. Use this mapping unless the user chooses different agents:

| pstack role | pi-subagents agent |
| --- | --- |
| `explorer`, `watcher` | `scout` |
| `researcher` | `researcher` |
| `implementer`, `mechanical` | `worker` |
| `reviewer` | `reviewer` |
| `planner`, `designer`, `synthesizer` | `oracle` |
| `owner` | `delegate` |

Write the selected IDs under `subagents.agentOverrides.<agent>.model`:

```json
{
  "subagents": {
    "agentOverrides": {
      "scout": { "model": "<explorer-model>" },
      "researcher": { "model": "<researcher-model>" },
      "worker": { "model": "<implementer-model>" },
      "reviewer": { "model": "<reviewer-model>" },
      "oracle": { "model": "<planner-model>" },
      "delegate": { "model": "<owner-model>" }
    }
  }
}
```

For OpenCode, do not write `.pi/settings.json`. Keep the concrete model choices in
the user's existing `opencode.json` or `opencode.jsonc`, and use the live
OpenCode agent names in the pstack role map. Preserve unrelated configuration.

### 6. Confirm

If a concrete configuration was written, tell the user the exact path and list
the model IDs assigned to each host agent. For OMP, name `.pstack/config.md` and
`.omp/config.yml`, and state that the latter's `task.agentModelOverrides` entries
route child models by agent name. For Pi, name both `.pstack/config.md` and
`.pi/settings.json`, and tell the user to run `/subagents-models` to inspect the
live mapping. For OpenCode, name the `opencode.json` or `opencode.jsonc` path
used. State that configuration does not create models, child agents, permissions,
or delegation facilities.

For OMP, label values in `.pstack/config.md` and `.omp/config.yml` as configured
models. Do not copy them into resolved or invoked fields. To report a completed
child's runtime model, inspect its persisted session JSONL using the
[OMP child model provenance procedure](../pstack-pi/references/runtime.md#omp-child-model-provenance).

If the host lacks per-child model selection, report that no role configuration
was written or activated. Name the missing capability. Only explain how to switch
the active model when the current host documents a model-switching command.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof, such as a `verify-*` skill or an existing harness. If not, offer once to invoke the sibling **create-verification-skill** skill. On no, move on without pushing.
