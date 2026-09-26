---
id: f00642
title: "A proposal keeps one work branch while it is in progress"
kind: feat
status: in-progress
type: proposal
track: trust
date: 2026-09-26
last-transition-id: b9db45ba-ef9b-42e5-8cfd-cb03248abdbc
last-correlation-id: b9db45ba-ef9b-42e5-8cfd-cb03248abdbc
last-transition-from: ready
---

# f00642 — A proposal keeps one work branch while it is in progress

## Goal

A proposal in progress has exactly one visible work branch, from its first commit until it leaves in-progress. Each finished slice (or round of slices) is published as a pull request from that same branch, which stays open and keeps growing. The branch disappears when the proposal leaves in-progress: delivered, blocked, paused or retired. So the open work branches are exactly the work in progress, and pull requests are exactly what should merge.

## why

Today every slice gets its own work ref (`wip/<model>/<id>-<slice>-g<n>/<topic>`), and `work publish` deletes it. A proposal with four slices shows four short-lived branches, and between two slices it shows none. From the integration branch its work looks discontinuous. The maintainer asked (2026-09-26) for one branch per proposal that stays while the proposal is in progress, with slice pull requests cut from it. They also asked that the branch goes away when the proposal is blocked or paused. The blocker is ref-lifecycle: a work ref whose content is already in a publication ref is classified `work-published` and reaped (x00648, 'a work branch ends when it is published'). With `--keep-work-ref`, the first slice PR therefore makes the proposal branch a violation. Reviewers (x00660) need the same shape: one branch per review round, committed after each verdict (x00664).

## non-goals

- Squash merges: the repository merges with merge commits, which is what lets a later pull request from the same branch show only the new commits.
- Moving a checked-out worktree's branch from outside the worktree (the hydrator never rewrites a branch an agent has checked out).
- Changing what a publication ref is or how the queue arms it.

## Slices

- global_gate: none

### S1 — The unit of a work ref is the proposal: a later slice continues on the proposal's branch
- **Status**: pending
- **Files**: `packages/cli/src/lib/proposal-branch.service.ts`, `packages/cli/src/lib/proposal-branch.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work enter` for a second slice of a proposal that already has a live work ref of the same agent reuses that ref and its worktree instead of creating another."
  - "The branch keeps the name of the slice it was opened for; the slices worked on are recorded in the commits. Renaming work refs is out of scope: every ref parser reads the slice, and a branch rename closes its pull requests. A review round (`review`, `close`) never joins an implementation branch."

### S2 — A slice publication keeps the proposal branch
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/lib/publication-target.service.ts`, `packages/cli/src/commands/work.command.spec.ts`, `packages/cli/src/lib/publication-target.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Publishing while the proposal still has open slices keeps the work ref by default and pushes a publication ref named for the slices it carries."
  - "Publishing the last open slice, or with the proposal moving to review, deletes the work ref as today (x00648 still holds for it)."
  - "A later publication from the same branch after the first merged shows only the commits not yet on the integration branch."

### S3 — ref-lifecycle does not reap the branch of a proposal in progress
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`, `packages/core/tests/src/lib/ref-lifecycle/work-namespace.spec.ts`
- **Gate**: type
- acceptance:
  - "A work ref whose proposal is in-progress on the integration branch is classified as ongoing work even when its content is in a publication ref; it is neither a violation nor reapable."
  - "The same ref, once its proposal is in review, done, blocked, paused or retired, is classified work-published or abandoned exactly as today."

### S4 — Leaving in-progress retires the branch without losing work
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `packages/core/src/lib/ref-lifecycle/park-work-ref.service.ts`
- **Gate**: type
- acceptance:
  - "A transition from in-progress to blocked, paused or retired deletes the proposal's work branch when its tip is contained in the integration branch or a publication ref."
  - "A tip with commits contained nowhere is kept under a non-branch ref (`refs/delendai/parked/<id>/...`) before the branch is deleted, and `work enter` on that proposal resumes from it."
  - "No transition deletes a branch whose unique commits it has not first proven contained or parked."

## acceptance

- `work enter` for a second slice of a proposal that already has a live work ref of the same agent reuses that ref and its worktree instead of creating another.
- The branch keeps the name of the slice it was opened for; the slices worked on are recorded in the commits. Renaming work refs is out of scope: every ref parser reads the slice, and a branch rename closes its pull requests. A review round (`review`, `close`) never joins an implementation branch.
- Publishing while the proposal still has open slices keeps the work ref by default and pushes a publication ref named for the slices it carries.
- Publishing the last open slice, or with the proposal moving to review, deletes the work ref as today (x00648 still holds for it).
- A later publication from the same branch after the first merged shows only the commits not yet on the integration branch.
- A work ref whose proposal is in-progress on the integration branch is classified as ongoing work even when its content is in a publication ref; it is neither a violation nor reapable.
- The same ref, once its proposal is in review, done, blocked, paused or retired, is classified work-published or abandoned exactly as today.
- A transition from in-progress to blocked, paused or retired deletes the proposal's work branch when its tip is contained in the integration branch or a publication ref.
- A tip with commits contained nowhere is kept under a non-branch ref (`refs/delendai/parked/<id>/...`) before the branch is deleted, and `work enter` on that proposal resumes from it.
- No transition deletes a branch whose unique commits it has not first proven contained or parked.
