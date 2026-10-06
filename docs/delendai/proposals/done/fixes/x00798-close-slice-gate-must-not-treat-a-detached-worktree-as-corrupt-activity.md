---
id: x00798
title: "close_slice gate must not treat a detached worktree as corrupt activity"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-01
last-transition-id: bb17e9e4-6732-42e6-ba39-015de1f45072
last-correlation-id: bb17e9e4-6732-42e6-ba39-015de1f45072
last-transition-from: review
shipped-in:
  - "a540526cf"
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
- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/validation-activity.resolver.ts`, `plugins/proposals/src/lib/swarm/validation-provider.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/swarm/validation-activity.spec.ts`, `plugins/proposals/tests/src/lib/swarm/validation-provider.spec.ts`
- **Gate**: type
- acceptance:
  - "a detached worktree yields a non-corrupt snapshot"
  - "an unmanaged worktree is ignored"
  - "a managed entry with an invalid lastSeen is still corrupt"
- shipped-in: `a540526cfa52`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at a540526cf, validate exit 0, tests 28/28 — Delivered by #718 (merge a540526cf). validation-activity and validation-provider specs 28/28.

## acceptance

- a detached worktree yields a non-corrupt snapshot
- an unmanaged worktree is ignored
- a managed entry with an invalid lastSeen is still corrupt
