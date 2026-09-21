# Upstream refresh after August 26, 2026

This port updates the August 26 checkout from upstream pstack 0.14.3 to 0.15.2.
The portable package version is `0.15.2-pi.1`.

The old lock pins `bdf7aa355337897f167153e05069aca505dae17c`, dated August 24.
The comparison starts at that exact baseline so it also captures changes missing
from the August 26 checkout. The new lock pins
`6ed0f7a9504f577d7529064103cecce9be7dfc5e`, the upstream main revision fetched
on September 21. Thirteen commits affect pstack in that interval. Of the 90
changed skill files, 41 match normalized upstream content, 47 retain portable
adaptations, and two obsolete references are removed.

## Changes brought across

| Upstream change | Portable result |
| --- | --- |
| `799151d`, `6fecddb`. Add and register make-bot-ui. | Add `skills/make-bot-ui` with host capability discovery, server-side secrets, webhook delivery checks, and tailnet access. Protect its adaptation from automatic replacement. |
| `73f8be4`. Disable implicit invocation for five skills. | Carry the upstream frontmatter changes into the affected skills. |
| `23a56e2`. Forge-neutral workflows and Fable 5.1 defaults. | Port GitHub-default and Origin-aware workflows. Keep canonical roles and live host model selection. Normalize the new Fable identifier in future imports. |
| `efa2a53`, `7314f72`. Add and compress the logo. | Include the final logo in the package and README. |
| `e8d856f`. Shorter skills and two principles. | Add `principle-attack-the-premise` and `principle-test-behavior-not-implementation`. Simplify how and why. Remove how's critique mode and its two unused references. |
| `d7cde2b`. Prose punctuation pass. | Carry prose changes across skills, references, and playbooks while preserving local runtime instructions. |
| `71ed0d1`. Version and inventory updates. | Update portable manifests and README counts. |
| `f8abedd`. Evidence for every claim. | Port evidence-or-label requirements into replies and review guidance. |
| `f5bdd68`. Neutral pronouns and status ticks. | Port wording and in-chat progress requirements, including the local plan reference. |
| `889ec4b`. Grok defaults for fixes and performance work. | Preserve the existing portable implementer role and explicit user model overrides. Do not require a vendor model on other hosts. |
| `5bf2b15`. Reasoning budget selection. | Offer max, xhigh, high, and medium during setup. Apply only detected model variants or supported reasoning controls. Preserve existing role overrides. |

## Portability decisions

The upstream README and Cursor installation guide are not installed in this
package. Their changed setup, inventory, and workflow guidance is represented
in the portable README and skills. The Cursor plugin manifest remains replaced
by the Pi, Claude Code, and Codex manifests.

The webhook skill does not invent Cursor's routine or secret-request tools on
another host. It accepts an existing webhook and a local secret source when the
host cannot provision them. Authentication and event parsing follow the selected
service's contract.

The package's existing runtime adapter, Pi subagent prerequisite, OpenCode
configuration, and project-local config path remain authoritative. Budget
selection does not grant a host new models or delegation capabilities.

The sync updater now rejects changes under protected prefixes and deletion of
protected files before writing anything. Previously those changes could be
missed while the upstream lock advanced. The regression tests exercise the CLI
against actual Git fixtures and check that rejected updates preserve content
and the lock. Local `--source` inputs must have clean managed paths so copied
content matches the reviewed Git revision. Automatic deletion of unprotected files remains unsupported.
This refresh explicitly removes the two deleted upstream critique references.

The bundled `orch frontier set` command still requires Graphite, as upstream
does. Its playbook now states that limit. The Shipping and Autopilot-stack
playbooks use the new forge-neutral approach.

The package preview exposed installed compiler dependencies under the bundled
scripts. A local `.npmignore` excludes those dependencies from the package.

## Reproduce the comparison and checks

With a clone of `https://github.com/cursor/plugins.git` at `<upstream>`:

```bash
git -C <upstream> log --oneline bdf7aa355337897f167153e05069aca505dae17c..6ed0f7a9504f577d7529064103cecce9be7dfc5e -- pstack
git -C <upstream> diff --name-status bdf7aa355337897f167153e05069aca505dae17c 6ed0f7a9504f577d7529064103cecce9be7dfc5e -- pstack
npm run verify
npm run test:sync
bun install --cwd skills/poteto-mode/scripts --frozen-lockfile
bun test orch watch-pr
bunx tsc --project skills/poteto-mode/scripts/watch-pr/tsconfig.json --noEmit --strict
npm pack --dry-run
```

Package checks validate the installed artifacts and bundled scripts. They do
not establish live execution of every workflow on every supported agent host.
