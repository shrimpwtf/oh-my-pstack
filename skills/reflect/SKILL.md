---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) for transcript discovery, child roles, model choices, tool access, questions, and skill authoring.

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent resolves its own transcript before fanning out. Use the host's active history resource, an explicit transcript directory, or `$PSTACK_TRANSCRIPTS_DIR`, in that order. Never scan another workspace or a global vendor history tree. If no transcript resolves, write a tight digest of the session and use that instead.

```bash
ls -t <agent-transcripts>/*.jsonl <agent-transcripts>/*/*.jsonl <agent-transcripts>/*/subagents/*.jsonl 2>/dev/null | head -10
```

Three transcript layouts: legacy flat (`<id>.jsonl`), current nested (`<id>/<id>.jsonl`), and subagent (`<parent>/subagents/<child>.jsonl`).

For each candidate, read the first JSONL line and check that `message.content[0].text` contains the conversation's opening user prompt. Take the matching path. If no path resolves, write a tight digest of the session and pass that instead.

### 2. Spawn three reviewers in parallel

Launch three reviewer children concurrently through the host's task facility. Use the configured choices when present; otherwise use the canonical roles below. Grant each child read access to the transcript and any host tools needed for context lookups, but forbid file writes in the brief. If the host cannot combine read-only repository posture with external-tool access, preserve tool access and enforce no writes in the brief; the parent applies edits.

| Lens | Configured choice / fallback role | Prompt template |
|---|---|---|
| Judgment | `reflect judgment`, else `reviewer` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling`, else `researcher` | `references/tooling-reviewer.md` |
| Divergent | `reflect divergent`, else `designer` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in their child reports.

### 3. Synthesize

Launch one `synthesizer` child, using the configured `reflect synthesizer` choice when present. Give it the host tools needed to spot-verify citations while forbidding repository writes in its standalone brief. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Backlog items file to whatever devex / backlog tracker your team uses automatically. Only the Accepted list waits for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): use the host's skill-authoring facility when available and run its draft / test / iterate loop; otherwise apply that loop directly.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): use the host's skill-authoring facility when available, or directly run the same description-review loop.
- `new skill: <kebab-name>`: use the host's skill-authoring facility when available, or author it directly from package conventions. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
