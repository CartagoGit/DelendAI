---
id: x00999
title: "A merged pull request spends only the head it merged"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-01
last-transition-id: b47a07a6-752e-4a44-99ad-7d90b3e9aaf3
last-correlation-id: b47a07a6-752e-4a44-99ad-7d90b3e9aaf3
last-transition-from: review
last-transition-at: 2026-11-20T23:43:48.888Z
---

# x00999 — A merged pull request spends only the head it merged

## goal

A publication ref counts as delivered only when its tip is the head the merged pull request carried, so a reopened unit's new work is never reaped.

## why

On 2026-11-01 the queue's reaper listed pull requests moments before #1614 opened, saw #1361 merged under the same branch name, and deleted the ref, which closed the live pull request of a reopened unit and dropped its hand-over. Any unit reopened on its name can lose its publication this way.

## non-goals

- Reaping work refs, whose rule does not read pull requests.

## slices

- global_gate: type

### S1 — The tip decides
- **Status**: in-progress
- **Files**: `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - "A publication ref whose tip differs from the head of its merged pull request is not spent, and is not reaped while fresh."
- shipped-in: `77c9f1adbb7c`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — shipped-in 77c9f1adbb7c is stale: slice files changed afterward (e.g. 78448c63b). Redeliver S1 on current HEAD and resubmit with fresh shipped-in plus scoped evidence.
- review-log: requested_changes by mai-code-2 — The delivery lineage is still not a fresh, self-consistent review target: the queue resolves latest delivery to 1fc7c701 while the slice still says shipped-in 77c9f1ad and all three scoped files changed afterward (including 78448c63b and later commits). Reconcile the proposal's shipped-in/current delivery commit, redeliver S1 on the intended tip, and resubmit so another reviewer can reproduce and typecheck that exact state.

## acceptance

- A publication ref whose tip differs from the head of its merged pull request is not spent, and is not reaped while fresh.
