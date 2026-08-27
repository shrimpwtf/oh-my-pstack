# oh-my-pstack

Portable, rigorous engineering workflows for [OMP](https://omp.sh/), Pi,
[OpenCode](https://opencode.ai/), Claude Code, Codex, and other hosts that support
the Agent Skills layout.

`oh-my-pstack` is a universal port of the original
[Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps the
portable catalog from its pinned upstream baseline, including playbooks,
principles, references, and verification scripts. It replaces Cursor-only
runtime assumptions with a host-neutral adapter.

## What is included

- 44 pstack skills and their supporting references from the pinned upstream baseline.
- Benny's three fail-closed issue-triage/reproduction skills.
- `poteto-mode` for routing work through the right playbook.
- `pstack-pi` for translating roles, delegation, models, transcripts, questions,
  and long-running work to the active host.
- A Pi extension that resolves model roles and delegates each route through
  `pi-subagents`.
- Native package metadata for OMP/Pi, Claude Code, and Codex, plus OpenCode setup
  guidance.
- Daily upstream checks that open a verified pull request only when portability gates pass.

The original Cursor repository is the content authority. The dsebban repository
was used only as an early structural example; it is not an upstream source.

## Install

### Pi

Install the public GitHub package:

```bash
pi install https://github.com/shrimpwtf/oh-my-pstack
```

Start Pi in your project:

```bash
pi
```

Use `pi list` to confirm the package. Use `pi update --extensions` to reconcile
installed Git packages, or `pi remove https://github.com/shrimpwtf/oh-my-pstack`
to remove it. Pi packages run with full system access; review the source before
installing and keep the package pinned or update it deliberately.

Install `pi-subagents` version 0.57.0 or later:

```bash
pi install npm:pi-subagents
```

Restart Pi. Run `/subagents-doctor`, then run `/pstack-doctor`. The delegation
extension provides the `subagent` tool and the built-in execution agents.

The pstack package provides `pstack_launch`, `pstack_panel`, `pstack_followup`, and `pstack_status`.
These tools read the model policy and pass explicit models to `pi-subagents`.
The model role remains the public run identity. The private runtime profile supplies the required tool set.

### OMP

Install from GitHub:

```bash
omp install https://github.com/shrimpwtf/oh-my-pstack
```

For local development, load the checkout directly:

```bash
omp --plugin-dir /path/to/oh-my-pstack
```

### OpenCode

OpenCode natively loads Agent Skills from `.opencode/skills/` in a project or
`~/.config/opencode/skills/` globally. Install the repository and copy its skills
into one of those discovery directories:

```bash
git clone https://github.com/shrimpwtf/oh-my-pstack.git \
  ~/.local/share/oh-my-pstack
mkdir -p ~/.config/opencode/skills
cp -R ~/.local/share/oh-my-pstack/skills/. ~/.config/opencode/skills/
```

Start OpenCode in your project. The skills appear through OpenCode's native
`skill` tool; ask it to load `setup-pstack` or `poteto-mode` by name. To update,
pull the repository and repeat the copy step:

```bash
git -C ~/.local/share/oh-my-pstack pull --ff-only
cp -R ~/.local/share/oh-my-pstack/skills/. ~/.config/opencode/skills/
```

For project-local installation, use `.opencode/skills/` instead:

```bash
git clone https://github.com/shrimpwtf/oh-my-pstack.git .pstack-source
mkdir -p .opencode/skills
cp -R .pstack-source/skills/. .opencode/skills/
```

OpenCode already provides primary and subagents. Configure their models through
your normal `opencode.json` or `opencode.jsonc` settings. Use `setup-pstack` to
write the separate pstack model-role policy. The skill does not change OpenCode
agent mappings.

### Claude Code and Codex

Clone or download the repository, then add it through the host's local plugin
workflow. Claude Code reads `.claude-plugin/plugin.json`; Codex reads
`.codex-plugin/plugin.json`. If plugin installation is unavailable, point the
host's Agent Skills configuration at the repository's `skills/` directory.

## Quick start

Start substantial work with `poteto-mode`. Use `pstack-pi` when a workflow needs
delegation or host-specific lifecycle behavior.

All hosts share the same skill content. The runtime adapter maps canonical pstack
roles to the capabilities actually exposed by the host. Missing integrations are
reported honestly and fail closed; for example, Benny requires an available
Slack/tracker/control adapter rather than pretending those tools exist.

## First-time setup

After installing, start a fresh agent session in the project you want to work on.
Run the setup skill once:

```text
$setup-pstack
```

It detects the models that your host exposes and verifies per-child model
selection. It then configures every original pstack model role. On Pi, choices
use `provider/model-id:thinking` and live in `.pstack/config.md` or
`$PSTACK_CONFIG`. Setup does not change host agent settings.

Native Pi does not include subagents. Install `pi-subagents`, restart Pi, and run
both doctor commands before setup. Each pstack workflow calls `pstack_launch` or
`pstack_panel`. Owner workflows call `pstack_followup` after terminal reports.
The router performs these operations:

1. Read `$PSTACK_CONFIG` or `.pstack/config.md`.
2. Resolve the exact pstack model role.
3. Validate the model against the live Pi inventory.
4. Inject the workflow name and role prompt into the child brief.
5. Select a private runtime profile for the execution role.
6. Let `pi-subagents` verify the strict tool list before the first model turn.
7. Label each visible run with the pstack model role.
8. Launch or continue through the structured `pi-subagents` RPC bridge.
9. Store the requested and observed route in the session ledger.
10. Expose the validated result through `pstack_status`.

Treat the direct `pi-subagents` completion as provisional. After the wait, call
`pstack_status`. Accept the result only when success is true and both failure
lists are empty.

Use `/pstack-routes` to inspect the latest ledger entries. Add `[fast]` after a
supported explicit model to request native Pi fast mode:

```text
how explorer: openai-codex/gpt-5.6-luna:xhigh [fast]
```

The router removes `[fast]` from the model identifier. It sends `fast: true` as a
separate launch field. The router rejects unsupported fast-mode models. The
provider account can still reject priority service. The ledger records that child
failure.

Then route your first real task through the main workflow:

```text
$poteto-mode add a small feature and prove it works end to end
```

The setup skill may offer to create a project verification skill when the project
has no existing way to exercise the real application. Accept that offer when you
want repeatable behavioral proof; otherwise setup finishes without changing the
project. Read `skills/setup-pstack/SKILL.md` for the complete setup contract.

## Automatic upstream updates

`.github/workflows/upstream-sync.yml` checks the original pstack `main` branch
every day at 04:17 UTC and can also be started manually. The pinned baseline lives
in `upstream.lock.json`.

The updater:

1. Fetches the latest upstream revision.
2. Normalizes known Cursor runtime bindings for portable hosts.
3. Updates only upstream-owned files.
4. Preserves OMP adapters and protected portability adaptations.
5. Stops before writing if an adapted file changed upstream.
6. Runs verification, updater tests, Bun tests, and strict TypeScript checking.
7. Opens a pull request only after those checks pass.

Run it locally:

```bash
npm run sync:check
npm run sync:apply -- --dry-run
npm run sync:apply
```

Protected adaptation changes require a human merge decision. The updater never
silently overwrites them.

## Development and verification

```bash
npm install
npm test
npm run verify
npm run typecheck
npm run test:sync
bun install --cwd skills/poteto-mode/scripts --frozen-lockfile
bun test orch watch-pr
bunx tsc --project skills/poteto-mode/scripts/watch-pr/tsconfig.json --noEmit --strict
```

`npm run verify` checks the skill inventory, references, manifests, model routes,
the extension types, and the protected upstream boundary.

## Host contract

Read `skills/pstack-pi/references/runtime.md` before adapting a workflow to a new
agent host. It separates pstack model roles from execution roles. It also defines
capability mapping, configuration paths, transcript handling, interaction
fallbacks, and verification ownership.

## License and attribution

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.

The pstack-derived material is adapted from Lauren Tan's original work in
`cursor/plugins`. See `THIRD_PARTY_NOTICES.md` for attribution and license text.
