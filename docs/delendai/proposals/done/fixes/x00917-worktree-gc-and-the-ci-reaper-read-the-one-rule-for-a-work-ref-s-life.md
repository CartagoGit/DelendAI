---
id: x00917
title: "Worktree GC and the CI reaper read the one rule for a work ref's life"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-18
last-transition-id: 1d7ad95c-1f59-4690-924e-e479930b45a3
last-correlation-id: 1d7ad95c-1f59-4690-924e-e479930b45a3
last-transition-from: review
last-transition-at: 2026-10-23T09:20:56.704Z
shipped-in:
  - "84ebce7f12da"
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

- **Status**: done
- **Files**: `packages/core/src/lib/ref-lifecycle/branch-delivery.service.ts`, `packages/core/tests/src/lib/ref-lifecycle/branch-delivery.spec.ts`
- **Gate**: type
- acceptance:
  - "A work ref whose proposal the rule holds open (on the integration branch, or at an unlanded tip) is not delivered, with the rule's reason; `branch_gc`, `swarm_hygiene` and `auto_work`'s hygiene lines then keep its worktree. A spec holds an in-progress unit kept and a closed one's removed."
- shipped-in: `84ebce7f12da`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84ebce7f12da, validate exit 0, tests 15/15; acceptance 1/1: (1) A work ref whose proposal the rule holds open is not delivered, with the rule's reason. branchDeliveryVerdict asks the one rule - it reads workRefProposalOpen … — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: a work ref whose proposal the one rule holds open is not delivered, with the rule's reason; branch_gc keeps its worktree (it removes one only when the verdict says delivered), swarm_hygiene reports rather than removes, and auto_work's hygiene lines run branch_gc in dry-run. The spec holds an in-progress unit kept and a closed one's removed. The branch-delivery spec passes 15/15 together with the CI reaper's spec. Delivery: the slice's work is commit 908809583 ('worktree GC and the CI reaper read the one work-ref rule'), merged as 84ebce7f12da (PR #1222).

### S2 — The CI reaper asks the rule

- **Status**: done
- **Files**: `tools/scripts/lint/in-progress-work-refs.helper.ts`, `tools/scripts/lint/in-progress-work-refs.helper.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - "`keepInProgressWorkRefs` keeps a reapable work ref when the rule holds its proposal open, reading the integration branch's tree as well as the ref's tip, so a unit whose tip predates its proposal's move to in progress is kept and one whose proposal the integration branch closed is reaped; a spec holds both."
- shipped-in: `84ebce7f12da`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84ebce7f12da, validate exit 0, tests 15/15; acceptance 1/1: (1) The CI reaper asks the rule, reading the integration branch's tree as well as the ref's tip. keepInProgressWorkRefs (tools/scripts/lint/in-progress-work-refs.h… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: keepInProgressWorkRefs asks the same workRefProposalOpen the rest of the system asks, passing landed, openAtTip and openOnIntegration, so a unit whose tip predates its proposal's move to in progress is kept and one the integration branch closed is reaped; the spec holds both cases. The reaper (tools/scripts/lint/ref-lifecycle-guard.script.ts:489) uses the helper. The specs pass 15/15. Delivery: commit 908809583 ('worktree GC and the CI reaper read the one work-ref rule'), merged as 84ebce7f12da (PR #1222); the slice's own extra commit 165e6043313e9 adds the case 'judges by the default policy when the project config cannot be read' to the branch-delivery spec.

## acceptance

- No component removes, or offers to remove, the unit of a proposal in progress.
