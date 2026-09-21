# Plan

Produce a phased implementation plan grounded in the **Principles** section of the `poteto-mode` skill. The plan is the deliverable. Do not implement.

Open an explicit plan with one item per step below.

## 0. Triage

Skip the plan when the change is one or two files with an obvious approach. Say so and stop.

Plan when the change spans three or more files, introduces architecture, has competing approaches or unclear scope, or the user asked for one.

## 1. Re-read principles

Read the **Principles** section of the `poteto-mode` skill end to end, and the leaf `principle-*` skills it indexes. The principles govern every plan decision. Cross-link them.

## 2. Scope and constraints

State your read of scope and constraints in one paragraph. Use the active host's user-question surface only for genuinely ambiguous intent (the **never-block-on-the-human** principle skill). Give concrete options with each open question.

Resolve what is in scope vs explicitly out, technical or platform constraints, patterns to preserve, and the definition of done.

## 3. Explore through the active adapter

Delegate codebase exploration (the **guard-the-context-window** principle skill) with the canonical `explorer` role and the active adapter's **Panel** protocol. Start every independent slice before waiting. The adapter owns concrete role and model routing.

Each explorer returns file pointers, conventions, dependencies, test infrastructure, and entry points. No inlined dumps.

## 4. Write the plan

Use the path the user supplies. Otherwise use a project-local plan file.

Single file `NN-slug.md` for small plans. For three or more phases, a directory with `overview.md` plus phase files:

```
NN-slug/
├── overview.md
├── phase-1-scaffold.md
├── phase-2-...md
└── testing.md
```

### Phase sizing

- One function or type plus tests, or one bug fix. Not "one file".
- Two to three files touched, max.
- Prefer eight to ten small phases over three to four large ones to preserve option value (the **foundational-thinking** principle skill).
- Split if a phase has more than five test cases or three functions.

### Overview file

- **Context.** Problem and why now.
- **Scope.** Included. Explicitly excluded.
- **Constraints.** Technical, platform, dependency, pattern.
- **Alternatives.** Two or three approaches sketched, choice and rationale (the **exhaust-the-design-space** principle skill). Skip when constraints dictate one.
- **Applicable skills.** Domain skills the implementer should invoke, by name.
- **Phases.** Ordered standard-markdown links to phase files.
- **Verification.** Project-level commands.
- **Implementation guidance.** Per section 6.

### Phase files

- Back-link to overview.
- **Goal.** What the phase accomplishes.
- **Changes.** Files affected and the change at a high level. What and why, not how. No code snippets.
- **Data structures.** Name the key types or schemas. One-line sketch only (the **foundational-thinking** principle skill).
- **Verification.** Per section 6.

Order phases so infrastructure and shared types land first (the **foundational-thinking** principle skill). Each phase should be independently shippable.

For changes touching existing code, apply the **redesign-from-first-principles** principle skill: if we'd built this with the new requirement on day one, what would it look like? Redesign holistically. Deliver incrementally.

If a phase creates or edits a skill, the phase instructs the implementer to use the installed **writing-for-agents** guidance.

## 5. Verification per phase

Each phase needs both:

**Static.** Type check, lint, project tests pass.

**Runtime.** Exercise the feature on the matching surface via the relevant control skill:

- Browser / Electron / Web UIs: the installed browser or GUI control capability.
- CLIs and TUIs: the installed terminal control capability.
- Native mobile: the installed simulator-driving capability.
- No control skill for the touched surface: flag it in the plan.

For bug fixes, the loop is reproduce on the surface, fix, verify on the same surface. Unit tests show a branch behaves a certain way. They do not prove the bug is gone (the **prove-it-works** principle skill).

For each live scenario, compare trunk and head. If trunk lacks the feature, record that and verify the added behavior plus the end state the user waits for. For performance work, name a metric both revisions produce, an interleaved probe, the measured trunk baseline, and a failure threshold. When the scenarios differ, use absolute budgets for added work and the end state instead of a ratio.

## 6. Implementation guidance

In the overview, name which poteto-mode non-negotiables the implementer must apply, by name:

- the **how** skill over each unfamiliar subsystem before changing it.
- the **interrogate** skill for adversarial review on contested designs before shipping.
- the **unslop** skill over each diff before commit and over any prose surface.
- the **show-me-your-work** skill to keep a decision trail when the plan is large enough to need an auditable record.
- the pstack **Babysit** playbook only when the user asks for PR-status work after opening the PR.

Resolve the forge once for the program. Default to `gh`. If `command -v origin` succeeds and Origin resolves the repository, use `origin pr` for every PR operation. Otherwise record the fallback to `gh`. Graphite is not required.

For unattended execution, schedule an audit tick through the active adapter. At each tick, re-read the execution playbook from trunk and the recorded objective. Audit both and fix drift. Count commits, pushes, PR or check changes, and stored reports as progress. Replace a lane that exceeds its expected runtime without such evidence. Post a status message even when nothing changed, with the PR, owner, state, head SHA, new verdicts, merges, operator gates, and blockers.

## 7. Hand back

Summarize phases, scope boundaries, applicable skills, and verification. Stop. The user decides when implementation starts.
