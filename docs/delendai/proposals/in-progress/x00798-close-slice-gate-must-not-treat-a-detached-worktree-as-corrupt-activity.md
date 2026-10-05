---
id: x00798
title: "close_slice gate must not treat a detached worktree as corrupt activity"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-01
last-transition-id: c777de8b-9cb3-417b-ad35-848135f3f99e
last-correlation-id: c777de8b-9cb3-417b-ad35-848135f3f99e
last-transition-from: ready
---

# x00798 — close_slice gate must not treat a detached worktree as corrupt activity

## Goal

A detached git worktree (rebase, bisect, scratch checkout, the candidate-refresh helper) made close_slice refuse with swarm-validation-blocked because an identity-less worktree entry was classed corrupt, and the gate scanned every worktree rather than the ones delendai manages. An identity-less worktree is no evidence (stale), corrupt stays for malformed data, and worktree evidence is limited to managed worktrees: under the worktrees directory or on a branch in the policy's managed branch namespaces.

## why

Any post-merge hook run creates a detached scratch worktree for minutes, blocking every close_slice in the meantime.

## non-goals

- Moving the candidate-refresh scratch worktree: it already lives in the OS temp directory, outside the repo, and is ignored once evidence is scoped to managed worktrees.

## Slices

- global_gate: none

### S1 — Identity-less worktrees are stale; scope evidence to managed worktrees
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/validation-activity.resolver.ts`, `plugins/proposals/src/lib/swarm/validation-provider.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/swarm/validation-activity.spec.ts`, `plugins/proposals/tests/src/lib/swarm/validation-provider.spec.ts`
- **Gate**: type
- acceptance:
  - "a detached worktree yields a non-corrupt snapshot"
  - "an unmanaged worktree is ignored"
  - "a managed entry with an invalid lastSeen is still corrupt"
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- a detached worktree yields a non-corrupt snapshot
- an unmanaged worktree is ignored
- a managed entry with an invalid lastSeen is still corrupt
