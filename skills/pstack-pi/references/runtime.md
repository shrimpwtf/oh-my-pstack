# Portable pstack runtime contract

This file is the host-neutral binding for the imported pstack skills. Read it before
using any instruction that mentions a task runner, model, transcript, question tool,
skill path, or long-running loop.

## Host selection

Use the capabilities exposed by the current agent host. Do not assume Cursor,
Claude Code, Codex, OMP, a particular CLI, or a particular model vendor. When a
capability is unavailable, preserve the workflow gate and use the nearest truthful
local equivalent. Do not claim a child, review, transcript, or live check happened
unless the host reported it.

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

Map these roles to the live host's agent or task names. OMP's recommended mapping is
`scout`, `designer`, `reviewer`, `security-reviewer`, `librarian`, `task`, and
`sonic`. Claude Code and Codex may expose different names. The live inventory wins.

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

### Reasoning budgets

Setup may record a `# budget: <label> (<target>)` comment and optional
`<workflow role> reasoning: <effort>` entries alongside model choices. The budget
comment records the user's preference. The per-role entries specify what to pass
to the host. `unlimited` keeps current efforts. `large`, `medium`, and `small`
target xhigh, high, and medium, respectively. A budget is not a spending limit.

Read the reasoning entry for the selected workflow role when delegating. For a
panel, pair efforts with model entries in order and require equal list lengths.
`host-default` means omit the reasoning override. For grouped roles such as
`feature, refactoring`, apply the matching grouped reasoning entry to both roles.
For a judge chosen from a pool, use the effort at that candidate's position.

Pass an explicit effort only when the live child facility and selected model
support it. If the host encodes effort in model IDs, use only detected variants
with a documented mapping. Never construct an ID by changing a suffix. Keep
supported aliases, including `inherit-parent`, unchanged. If an explicit effort
is unsupported or a panel's lengths differ, report the invalid configuration
before spawning. Do not silently claim the requested budget was applied.

Hosts without reasoning controls retain their model choices. Setup must report
that limitation and omit applied budget and reasoning entries. A model inventory
alone does not establish support for reasoning controls.

## Questions and interaction

Use the host's structured user-interaction tool when it exists. Otherwise ask one
focused question in the normal conversation. Never invent a vendor-specific question
tool name.
An observable fact belongs to a probe or verification run, not a user question.

## Skills and paths

Invoke skills by their host-supported skill name, normally `/skill:<name>` or `$name`.
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

## Long-running work and verification

Use the host's durable goal, watcher, or loop facility when available. Otherwise keep
the predicate and checkpoint in a project-local decision trail. A timed heartbeat is
only a fallback. Re-arm a watcher after every state-changing wave.

The root coordinator owns user interaction, approvals, integration, and final
verification. A worker report is evidence, not proof. The root must inspect artifacts
and run the promised checks on the integrated result.
