---
id: x00999
title: "A merged pull request spends only the head it merged"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-01
last-transition-id: bf8549f1-c3f9-439a-9273-2015ab3b3f9b
last-correlation-id: bf8549f1-c3f9-439a-9273-2015ab3b3f9b
last-transition-from: in-progress
last-transition-at: 2026-11-01T07:32:18.681Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - "A publication ref whose tip differs from the head of its merged pull request is not spent, and is not reaped while fresh."
- shipped-in: `77c9f1adbb7c`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A publication ref whose tip differs from the head of its merged pull request is not spent, and is not reaped while fresh.
