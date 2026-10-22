---
id: x00935
title: "An emptied worktree is a lost checkout, not uncommitted work: start-up reconciliation never commits and pushes the deletion of the tree"
kind: fix
status: in-progress
type: proposal
track: workflow
date: 2026-10-22
last-transition-id: a86ab6ff-3c80-4a06-a85a-73a34c7a4314
last-correlation-id: a86ab6ff-3c80-4a06-a85a-73a34c7a4314
last-transition-from: ready
last-transition-at: 2026-10-22T18:54:32.340Z
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
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-forge-sync.service.ts`, `packages/core/tests/src/lib/work-units/unit-forge-sync.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Before `git add -A`, the pending change is measured; when it deletes more than half of the files the unit's HEAD tracks, nothing is committed or pushed for that unit and the result is `outcome: 'failed'` with a detail naming a lost checkout, the deleted count and `work enter` as the way back."
  - "An ordinary dirty tree — edits, additions, a few deletions — is kept and pushed exactly as today."
  - "A spec drives a unit whose worktree lost its files and asserts its ref and the forge's are unchanged and the outcome names the lost checkout; another drives a small deletion and asserts it is still kept."

## acceptance

- Before `git add -A`, the pending change is measured; when it deletes more than half of the files the unit's HEAD tracks, nothing is committed or pushed for that unit and the result is `outcome: 'failed'` with a detail naming a lost checkout, the deleted count and `work enter` as the way back.
- An ordinary dirty tree — edits, additions, a few deletions — is kept and pushed exactly as today.
- A spec drives a unit whose worktree lost its files and asserts its ref and the forge's are unchanged and the outcome names the lost checkout; another drives a small deletion and asserts it is still kept.
