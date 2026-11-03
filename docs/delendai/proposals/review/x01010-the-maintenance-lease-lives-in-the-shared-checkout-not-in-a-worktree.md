---
id: x01010
title: "The maintenance lease lives in the shared checkout, not in a worktree"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-03
last-transition-id: 7f79d4e0-4d44-4962-9ed2-d11a230363f4
last-correlation-id: 7f79d4e0-4d44-4962-9ed2-d11a230363f4
last-transition-from: in-progress
last-transition-at: 2026-11-03T12:16:18.897Z
---

# x01010 — The maintenance lease lives in the shared checkout, not in a worktree

## goal

A CLI process whose workspace is a unit worktree takes the maintenance lease under that worktree and recreates it after the worktree is removed, so work publish exits 4 with Directory not empty. Resolve the lease path against the shared checkout of the git common dir.

## why

`work publish` pushed its branch and then exited 4, because removing the unit's worktree failed with "Directory not empty". What remained was `<worktree>/.cache/delendai/startup/maintainer.lease`, held by a CLI process whose workspace was that worktree.

The CLI assembly (`cli/assemble.ts`) resolved the lease path against the workspace root, so a process started inside a unit worktree took a lease under that worktree. `take()` in the lease service runs `mkdir` recursively, so the next heartbeat after the removal recreated the folder and the removal could never finish. Maintenance acts on refs, which every worktree of a repository shares, so a worktree must never hold a lease of its own: the maintainer is one per repository, and the lease belongs in the shared checkout of the git common dir.

## non-goals

- Changing the lease protocol (hard link to take, rename to renew, TTL, heartbeat).
- Making the worktree removal retry or tolerate a process that still runs in it.
- Moving or migrating existing lease files: a lease is a record with a TTL, and a stale one under a removed worktree is gone with it.
- Deciding which process may maintain (the stale-runtime gate is untouched).

## slices

- global_gate: none

### S1 — Put the maintenance lease in the shared checkout
- **Status**: review
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease-path.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/tests/src/lib/development-policy/maintenance-lease-path.spec.ts`
- **Gate**: none
- shipped-in: `56655a4722e2`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- From a linked worktree, the lease path is the shared checkout's `<cacheDir>/startup/maintainer.lease`, the same as from the checkout itself.
- Outside a git repository the path stays under the workspace; an absolute cache dir is used as given.
- A spec using a real linked worktree asserts all three.
