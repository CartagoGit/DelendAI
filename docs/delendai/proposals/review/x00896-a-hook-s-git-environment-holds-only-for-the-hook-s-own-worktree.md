---
id: x00896
title: "a hook's git environment holds only for the hook's own worktree"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: f42e948b-835b-442b-94fa-082e4f5aa321
last-correlation-id: f42e948b-835b-442b-94fa-082e4f5aa321
last-transition-from: in-progress
last-transition-at: 2026-10-14T03:51:34.082Z
---

# x00896 — a hook's git environment holds only for the hook's own worktree

## goal

A git command delendai runs from inside a git hook keeps `GIT_DIR`, `GIT_INDEX_FILE` and their kin only when it runs in the hook's own worktree. Run in any other unit or checkout, it gets an environment without them, so it answers about the repository its `cwd` names.

## why

On 2026-10-14 a `post-merge` hook in the x00895 unit ran `report-invariants`. It reported `units-on-the-forge` BROKEN, with the same "4 uncommitted change(s)" in three idle units (f00551, f00761, x00893). All three were clean. Git exports `GIT_DIR` to a hook, and to a linked worktree's `post-merge` too (checked on git 2.x). The invariant asks each unit `git status --porcelain` through `readGit`, which inherited it, so every unit was reported with the hook's own changes. The invariants reader already stripped those variables in a private copy of `hookFreeEnvironment`. `readGit` and `createGitRunner` did not, and the `post-merge` hook also runs `work reap`, which removes a unit unless its worktree "holds an edit of its own": under the hook's `GIT_DIR`, that question was answered by the shared checkout.

## non-goals

- The other places that spawn git directly. They run outside hooks or in the hook's own tree; a lint that finds a spawn bypassing the shared environment is a later slice if one turns up.

## slices

- global_gate: type

### S1 — The central git readers pass the hook's environment only to its own worktree

- **Status**: review
- **Files**:
  - `packages/core/src/lib/shared/hook-free-environment.helper.ts`
  - `packages/core/src/lib/work-units/work-unit-shared.service.ts`
  - `packages/core/src/lib/shared/git-write.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/tests/src/lib/shared/hook-free-environment.helper.spec.ts`
  - `packages/core/src/lib/scan/dip-violation.ts`
  - `packages/core/tests/src/lib/scan/dip-violation.spec.ts`
- **Gate**: type
- acceptance:
  - `gitEnvironmentFor(cwd)` returns the environment unchanged outside a hook and for the hook's own worktree, and without `HOOK_GIT_ENVIRONMENT` for any other directory.
  - `readGit` and `createGitRunner` (when no environment is passed) use it; `git status` in another repository from inside a hook reports that repository's changes, not the hook's.
  - The invariants reader uses `hookFreeEnvironment` instead of its own copy.
- shipped-in: `b79f2949e6d9`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A hook-started invariant report or reap judges each unit by the unit's own working tree.
