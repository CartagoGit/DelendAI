---
id: x00748
title: "A published unit leaves no worktree behind"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00742]
last-transition-id: 9d9ef662-eb48-4add-bfc0-93d3f332ba9d
last-correlation-id: 9d9ef662-eb48-4add-bfc0-93d3f332ba9d
last-transition-from: review
shipped-in:
  - "4aef4c193d7c65adea568f0c8542e37f3768d8c0"
---

# x00748 — A published unit leaves no worktree behind

## goal

Publishing a unit removes its worktree and its work ref, including when
the unit is published from inside its own worktree.

## why

On 2026-09-29 a reviewer finished two packs. Both were published
(#631 merged, #632 open), and both worktrees and local work refs stayed
behind. `review next` publishes from the reviewer's worktree. The
publisher refused to remove the worktree that was the current directory,
and when it refused, it also kept the work ref. Nothing ever came back
for them, so every pack published this way left its unit behind for the
owner to clean up.

## why this design

- The caller's own worktree is removed like any other, under the same
  checks: it must be clean, so no edit made after the checkpoint is lost.
  The step says it was the current directory and where to continue.
- A dirty worktree still keeps both the worktree and the work ref.

## non-goals

- Sweeping leftovers of earlier publications. The two found were
  checked, contained in develop and #632, and removed by hand.

## architecture

- `packages/core/src/lib/work-units/work-publish.service.ts`.

## Slices

- global_gate: none

### S1 — The caller's worktree goes with its unit

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-publish.service.spec.ts`
- **Files**:
  - `packages/core/src/lib/work-units/work-publish.service.ts`
  - `packages/core/tests/src/lib/work-units/work-publish.service.spec.ts`
- shipped-in: `4aef4c193d7c`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — x00748 S1 (shipped-in 4aef4c193d7c, merged via PR #635 to develop) makes the publishWorkUnit publisher remove the unit's own worktree when clean, even the one it's being called from, and tells the caller where to continue ('It was the current directory: continue from ${root}'). A dirty tree (uncommitted changes OR work after checkpoint) keeps both the worktree and the work ref, with a step that names the count. Spec covers all four branches: clean caller's worktree, clean other worktree, dirty caller's, post-checkpoint: 17/17 pass.
- review-attribution: unrecorded — nothing in Git names who delivered 4aef4c193d7c65adea568f0c8542e37f3768d8c0: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

## dependency graph

None.

## acceptance

- Published from inside its clean worktree, a unit's worktree and work ref
  are removed, and the step names the directory to continue from.
- A worktree with uncommitted changes keeps the worktree and the work ref.
