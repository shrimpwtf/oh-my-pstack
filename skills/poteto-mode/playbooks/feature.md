### Feature

**You own the design. Plan, review, verify.** Delegate implementation; stay in the lead.

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration. Skipping stays as `architect skipped: <reason>`; do not fold the design decision silently into implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Resolve the `feature` pstack model role. On Pi, call `pstack_launch` with execution role `implementer` and a complete brief. Set `worktree` for an isolated writer. The router binds the configured per-run `model`. Give the child specific paths, operations, tests, and no-touch zones. You stay the lead and own integration. Use one writer for tightly coupled code. Use parallel writers only for structurally disjoint modules.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass; flag it.
6. Rebase into small, ordered commits; stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. The root starts every additional participant after the blocking phase and relays frozen results to the owner; children never fan out. Root-level panels are for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries; start a fresh owner rather than changing units through follow-ups.

**Reply:** what you built, what you chose and why, open decisions. Tables for design alternatives.
