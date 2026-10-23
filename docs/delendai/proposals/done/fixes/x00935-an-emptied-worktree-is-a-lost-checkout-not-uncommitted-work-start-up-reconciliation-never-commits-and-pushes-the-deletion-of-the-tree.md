---
id: x00935
title: "An emptied worktree is a lost checkout, not uncommitted work: start-up reconciliation never commits and pushes the deletion of the tree"
kind: fix
status: done
type: proposal
track: workflow
date: 2026-10-22
last-transition-id: 968b8dc0-b536-4b90-b7ac-9347c74db0d8
last-correlation-id: 968b8dc0-b536-4b90-b7ac-9347c74db0d8
last-transition-from: review
last-transition-at: 2026-10-23T09:30:17.628Z
shipped-in:
  - "a9eca6cfc7f9"
---

# x00935 — An emptied worktree is a lost checkout, not uncommitted work: start-up reconciliation never commits and pushes the deletion of the tree

## goal

When start-up reconciliation finds a unit's worktree whose pending change deletes most of the tracked tree, it reports a lost checkout and leaves the unit's ref as it was, instead of committing the deletion as 'uncommitted work' and pushing it to the forge.

## why

On 2026-10-22 at 20:48 `unit-forge-sync.service.ts:122-156` committed `chore(wip): keep the uncommitted work found at start` on `delendai/wip/minimax-m3.1-flash-preview/review/batch-all-g14/verdicts` and pushed it: 4,928 files changed, 682,655 deletions — the whole repository. The unit's worktree was still registered but its files were gone; `git status --porcelain` listed every tracked file as deleted, the code read that as edits nobody was making any more, ran `git add -A`, committed and pushed.

The rule it applies ("edits nobody is making any more are work too: kept, then pushed") is right for edits and wrong for a checkout that is no longer there. A unit whose tree vanished has no work in it to keep; its work is its ref, which was intact one commit earlier. Recording the deletion turns a lost directory into a commit that, if the unit is ever published, proposes deleting the repository, and it overwrites the forge's copy of the unit's real tip with it.

The owner's rule is that unmerged work is never discarded; nothing here discards work. The ref keeps its tip, and the lost checkout is reported so it can be recreated with `work enter`.

## non-goals

- Repairing the g14 ref itself: it is another agent's unit, and its tip before the deletion (e6bc321fe) is one commit back.
- Changing what counts as uncommitted work for an ordinary dirty tree.

## slices

- global_gate: type

### S1 — Reconciliation refuses to keep a deletion of most of the tree
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/unit-forge-sync.service.ts`, `packages/core/tests/src/lib/work-units/unit-forge-sync.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Before `git add -A`, the pending change is measured; when it deletes more than half of the files the unit's HEAD tracks, nothing is committed or pushed for that unit and the result is `outcome: 'failed'` with a detail naming a lost checkout, the deleted count and `work enter` as the way back."
  - "An ordinary dirty tree — edits, additions, a few deletions — is kept and pushed exactly as today."
  - "A spec drives a unit whose worktree lost its files and asserts its ref and the forge's are unchanged and the outcome names the lost checkout; another drives a small deletion and asserts it is still kept."
- shipped-in: `d366a8a050ed`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at a9eca6cfc7f9, validate exit 0, tests 9/9; acceptance 3/3: (1) The pending change is measured before `git add -A`, and an emptied tree stops the unit with the reason named. In syncUnitsWithForge the unit's tree is read fir… (2) An ordinary dirty tree is kept and pushed exactly as today. The guard is the only new branch: when lostCheckout returns undefined the code goes on to the same … (3) A spec drives both sides. The case 'does not keep a lost checkout: an emptied tree is neither committed nor pushed' removes both files the unit's HEAD tracks a… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: the pending change is measured before git add -A, a tree that deletes more than half the files its unit's HEAD tracks is not committed or pushed and is reported outcome 'failed' with a detail naming the lost checkout, the deleted count and `delendai work enter` as the way back; an ordinary dirty tree is kept and pushed as before; and the specs drive both - the emptied tree (the unit's ref and the forge's are unchanged, the outcome names the lost checkout) and the small deletion (still kept). The forge-sync spec passes 9/9. Delivery: merge a9eca6cfc7f9 (PR #1372, 'emptied tree is not work').

## acceptance

- Before `git add -A`, the pending change is measured; when it deletes more than half of the files the unit's HEAD tracks, nothing is committed or pushed for that unit and the result is `outcome: 'failed'` with a detail naming a lost checkout, the deleted count and `work enter` as the way back.
- An ordinary dirty tree — edits, additions, a few deletions — is kept and pushed exactly as today.
- A spec drives a unit whose worktree lost its files and asserts its ref and the forge's are unchanged and the outcome names the lost checkout; another drives a small deletion and asserts it is still kept.
