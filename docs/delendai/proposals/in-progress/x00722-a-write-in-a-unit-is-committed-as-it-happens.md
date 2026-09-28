---
id: x00722
title: "A write in a unit is committed as it happens"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00707, x00714]
---

# x00722 — A write in a unit is committed as it happens

## goal

What a delendai tool writes in a unit of work's worktree is committed to the
unit's branch when the call returns, whichever host or model called it. The
owner can follow each unit's progress on its branch while it goes on.

## why

On 2026-09-28 six reviewers worked for hours. Their verdicts, and the
proposals they handed on, landed in their units' worktrees and stayed
there: agents committed at the end if at all, and the procedure's "commit
after each verdict" was followed by none of them. The branches did not
move, the owner could not follow any of it, and a session that ended took
its uncommitted verdicts with it. Implementers did the same with the files
they wrote. The work ref is the unit's record, and the policy already
pushes committed work every few minutes; nothing was committed to push.

## why this design

- **At the write binding** (`bindWriteRoot`), which every `caller-checkout`
  tool passes through, from every plugin and host. No tool has to remember.
- **Only in a unit's worktree** (`unitBranchOf`): a working tree other than
  the shared checkout, on a branch under the policy's work-ref prefix.
  Anywhere else, and in a project with no work-ref model, nothing changes.
- **Only what the call changed.** The dirty paths and their content are
  read before and after the call, and exactly the paths the call changed
  are committed; the agent's other edits stay as they were. A call that
  fails, or changes nothing, commits nothing.
- **The commit names the call**: `chore(delendai): <tool> <proposal> <slice>
  <action>`, within one line.
- **One call at a time per worktree**, so each commit holds its own call's
  writes.
- **A refused commit never fails the call.** The answer carries a line with
  what the tool could not commit and the command to commit it.

## non-goals

- Committing edits an agent makes outside delendai's tools.
- Pushing: the policy's checkpoint cadence already does that for committed
  work.

## architecture

- `packages/core/src/lib/shared/commit-call-writes.ts` (new).
- `packages/core/src/lib/shared/bind-write-root.ts`: every bound call goes
  through it.
- `packages/core/src/lib/development-policy/project-branches.ts`:
  `unitBranchOf`.

## Slices

- global_gate: none

### S1 — Commit what the call wrote, in a unit

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`
- **Files**:
  - `packages/core/src/lib/shared/commit-call-writes.ts`
  - `packages/core/src/lib/shared/bind-write-root.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`

## dependency graph

None.

## acceptance

- A verdict recorded in a review unit is a commit on the unit's branch,
  holding only the proposal file.
- A file the agent was editing, and the call did not touch, stays
  uncommitted.
- In the shared checkout, and on a branch outside the work-ref prefix,
  nothing is committed.
