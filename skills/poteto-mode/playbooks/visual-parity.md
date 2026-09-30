### Visual parity

**You own pixel-exact equivalence. The baseline is the spec; you do not touch it.** For "make X match Y exactly", styling-system migrations, porting a UI across frameworks. Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. A blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and ask, don't edit it.
3. Migrate one component at a time. Each is an independent artifact, so the root starts one canonical `owner` per component through the active adapter's **Long-lived owner** protocol, bound to an actual component worktree. Shared primitives migrate first as a blocking phase. Follow the active adapter's capability matrix for owner retention and follow-up; rely on session persistence or continuous execution only when the adapter documents support.
4. Before dispatching an owner, confirm through the active adapter that its execution root is the intended component worktree and its session supports the required retention and follow-up. Verify the actual repository root before accepting writes. If the adapter cannot establish the required workspace or lifecycle, fail closed; do not substitute a temporary isolated workspace unless the adapter confirms it meets the ownership contract.
5. Verify each component against its baseline via image diff on the matching surface via the control skill. A nonzero diff is a fail; investigate the pixel delta, don't wave it through. Use root-controlled **Autonomous run** iterations per component until the diff is zero.
6. Run **Opening a PR** per component or per safe batch.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.
