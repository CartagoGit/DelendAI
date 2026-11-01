---
id: x00999
title: "A merged pull request spends only the head it merged"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-01
last-transition-id: fcf3ed27-cf07-4424-b79f-7e8b22b7086a
last-correlation-id: fcf3ed27-cf07-4424-b79f-7e8b22b7086a
last-transition-from: ready
last-transition-at: 2026-11-01T07:30:04.010Z
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
- **Status**: pending
- **Files**: `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - "A publication ref whose tip differs from the head of its merged pull request is not spent, and is not reaped while fresh."

## acceptance

- A publication ref whose tip differs from the head of its merged pull request is not spent, and is not reaped while fresh.
