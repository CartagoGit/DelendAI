---
id: x00917
title: "Worktree GC and the CI reaper read the one rule for a work ref's life"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-18
---

# x00917 — Worktree GC and the CI reaper read the one rule for a work ref's life

## goal

The two components x00911 did not reach decide a work ref's end with the same rule as the publisher, the ref maintenance, the doctor and the checkpoint sweep (`workRefFate`, `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`). When this is done no component offers to remove, or removes, the unit of a proposal still in progress.

## why

Found 2026-10-18, calling `delendai_proposals_auto_work` on this repository: its `hygieneActions` said "branch_gc dry-run would remove 2 worktree(s)", the units of f00551 and a00095, both in progress, and the plan asked for confirmation because of it.

- **Worktree GC.** `branchDeliveryVerdict` (`packages/core/src/lib/ref-lifecycle/branch-delivery.service.ts`) answers through `reconcileRefs`, which calls a work ref delivered once its work is in the integration branch, whether or not its proposal is open. `runBranchGcEngine` (`plugins/proposals/src/lib/shared/branch-gc-engine.ts`) removes a worktree on that verdict, and `auto_work` and `swarm_hygiene` surface it as the thing to do.
- **The CI reaper.** `tools/scripts/lint/ref-lifecycle-guard.script.ts` keeps a reapable work ref only when its proposal is in progress at the ref's own tip (`keepInProgressWorkRefs`). The rule reads a landed ref by the integration branch: a ref whose tip predates the move to in progress (the proposal moved on `develop` after the unit's last commit) is reaped from under an open proposal, and one whose tip still says in progress after `develop` closed it is kept forever.

## non-goals

- Changing the rule itself (x00911 S1).

## slices

- global_gate: type

### S1 — Worktree GC asks the rule

- **Status**: pending
- **Files**: `packages/core/src/lib/ref-lifecycle/branch-delivery.service.ts`
- **Gate**: type
- acceptance:
  - "A work ref whose proposal the rule holds open (on the integration branch, or at an unlanded tip) is not delivered, with the rule's reason; `branch_gc`, `swarm_hygiene` and `auto_work`'s hygiene lines then keep its worktree. A spec holds an in-progress unit kept and a closed one's removed."

### S2 — The CI reaper asks the rule

- **Status**: pending
- **Files**: `tools/scripts/lint/in-progress-work-refs.helper.ts`
- **Gate**: type
- acceptance:
  - "`keepInProgressWorkRefs` keeps a reapable work ref when the rule holds its proposal open, reading the integration branch's tree as well as the ref's tip, so a unit whose tip predates its proposal's move to in progress is kept and one whose proposal the integration branch closed is reaped; a spec holds both."

## acceptance

- No component removes, or offers to remove, the unit of a proposal in progress.
