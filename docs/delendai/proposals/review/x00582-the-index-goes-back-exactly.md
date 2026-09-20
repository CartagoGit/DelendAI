---
id: x00582
title: "The index goes back exactly"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - safety
---

# x00582 — The index goes back exactly

## goal

A refused refresh leaves the index in the state it found it, including a
file that was only partly staged.

## why

x00577 stopped the rollback from restoring generated paths to HEAD, which
could have discarded uncommitted work. It kept, per path, the file's
bytes and a boolean: *was it staged*.

A boolean can express two of the three states a path can be in. The third
is ordinary: some hunks added, more editing still in the worktree —
exactly where somebody is in the middle of shaping a commit. Restoring
that with `git add` promotes the unstaged half, so the next commit
quietly contains more than its author staged.

Nothing is lost that way, and it is still wrong: the rollback's promise
is that a refusal costs nothing, and silently changing what a commit
would contain is a cost.

## non-goals

- Changing which paths are bounded. Still only the generated ones.
- Preserving anything outside those paths. Still untouched.

## architecture

The snapshot keeps git's own index entry — `<mode> <object>` from
`ls-files --stage` — instead of a boolean. On a refusal the bytes go back
and the entry is written with `update-index --cacheinfo`, which restores
the exact split between what was staged and what was not. A path the
index did not hold is unstaged as before.

## slices

### S1 — the rollback restores the index entry, not a summary of it

- **Status**: review
- **Files**: [`packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`

## acceptance

- A half-staged file keeps its worktree content **and** its index entry:
  the unstaged half is still unstaged afterwards.
- A path the index did not hold stays untracked.
- Everything x00577 and x00570 established still holds.
- The new test **fails against the boolean implementation**.

## risks and mitigations

- **`update-index --cacheinfo` needs a valid mode and object.** Both come
  from git's own reading a moment earlier; when either is missing the
  path is skipped rather than guessed at.
