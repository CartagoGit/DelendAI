---
id: x00634
title: "A merged branch does not outlive its worktree"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-24
---

# x00634 — A merged branch does not outlive its worktree

## goal

Once a pull request merges and the forge deletes its branch, the branch
also disappears from every clone, including one where a worktree still
has it checked out, as long as nothing would be lost.

## why

Reported by the project owner on 2026-09-24: merged branches stayed in
the repository. On the forge they were gone (the queue reaps them); in
the local clone four `[gone]` branches remained. Each was checked out in
a linked worktree the agent had left behind, and `maintain-ref-namespace`
never touches a ref a worktree has checked out, so neither the worktree
nor the branch was ever removed.

## why this design

- The namespace maintenance is already the one writer for local work
  and publication refs; it runs after every merge into the integration
  branch. It now handles this case instead of skipping it.
- Three conditions, all required: the ref was published and its remote
  copy is gone (`upstream:track` is `gone`, which a never-pushed ref an
  agent just entered can never be); the integration branch contains
  everything it adds (`isSpent`); and `git worktree remove` without
  `--force` succeeds, which git refuses for modified or untracked files.
- A dirty worktree on merged work is left alone and reported.

## non-goals

- Touching the main worktree, or any ref that is not spent.

## Slices

- global_gate: none

### S1 — Spent, published-and-gone refs lose their clean worktree and the ref

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/git/maintain-ref-namespace.script.spec.ts`
- **Files**: `tools/scripts/git/maintain-ref-namespace.script.ts`,
  `tools/scripts/git/maintain-ref-namespace.script.spec.ts`
- Real-repository specs: a clean worktree on a merged, deleted branch is
  removed with the ref; a worktree with changes is kept; a never-pushed
  ref on older history keeps its worktree.

## acceptance

- After a merge, no `[gone]` branch whose work is in the integration
  branch remains in a clone, unless its worktree holds changes.
