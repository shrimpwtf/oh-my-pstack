### Feature

**You own the design. Plan, review, verify.** Delegate implementation; stay in the lead.

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration. Skipping stays as `architect skipped: <reason>`; do not fold the design decision silently into implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing through the active adapter's **Bounded session** protocol with canonical `implementer` role and a specific scope (file paths, named data shape and operations, tests it owns, explicit no-touch zones). You stay in the lead: review every line and own integration. A single writer can use the current checkout. Concurrent writers need separate runtime-bound roots or proven disjoint write sets; when they share a branch, serialize Git, index, and branch operations.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass; flag it.
6. Rebase into small, ordered commits; stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. The root starts every additional participant after the blocking phase and relays frozen results to the owner; children never fan out. Root-level panels are for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries; start a fresh owner rather than changing units through follow-ups.

**Reply:** what you built, what you chose and why, open decisions. Tables for design alternatives.
