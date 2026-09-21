### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration. Skipping stays as `architect skipped: <reason>`. Do not fold the design decision silently into implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing through the active adapter's **Bounded session** protocol with canonical `implementer` role and a specific scope (file paths, named data shape, its organizing structure per **principle-model-the-domain**, and operations, tests it owns, explicit no-touch zones). You stay the lead: review every line and own integration. When the implementation admits multiple valid shapes, use **arena** so independent candidates expose the alternatives and a separate judge compares them. A child that cannot delegate owns its diff directly and returns it for root review. Re-ground upstream-derived files against their source. Port shared-primitive improvements to every consumer and verify each. One writer for tightly coupled code. Parallel writers only on structurally disjoint modules with isolated worktrees.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. The root starts every additional participant after the blocking phase and relays frozen results to the owner. Children never fan out. Root-level panels are for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Start a fresh owner rather than changing units through follow-ups.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.
