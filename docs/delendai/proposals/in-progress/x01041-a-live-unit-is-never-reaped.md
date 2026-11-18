---
id: x01041
title: "A live unit is never reaped"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-07
last-transition-id: 38d6800e-38d8-424a-ac42-02ac51ed84e4
last-correlation-id: 38d6800e-38d8-424a-ac42-02ac51ed84e4
last-transition-from: review
last-transition-at: 2026-11-18T04:46:08.181Z
---

# x01041 — A live unit is never reaped

## goal

One judgement says whether a unit is alive: a fresh lease heartbeat, a live owner session, an in-flight proof (or held compute slot) for the unit, or a process working inside its worktree. The doctor, the reaper, the end of finished units, orphan detection and the queue all read it, and removing a unit deletes its branch by compare-and-swap at the judged tip before its worktree, re-checking life before each step.

## why

On 2026-11-05 the worktree of a live unit (f00808-S8) was removed while its proof ran; its lease heartbeat was one minute old. `removeUnitCheckout` ran `git worktree remove [--force]` first and only then `update-ref -d` on the branch, so a branch that moved or a unit that came back to life lost its worktree before the compare-and-swap could refuse. It is called by the reaper (two paths) and by the end of finished units, which the host server runs at boot in every project. None of them checked for a live lease, a live process or a proof in flight: the reaper calls an abandoned unit spent when it carries nothing or its tip is kept on the remote, and the doctor's `no-abandoned-work-refs` listed the unit abandoned only because no worktree stood on it, although `.git/delendai/unit-leases/<id>.json` held a fresh heartbeat. Each surface judged life its own way, and none judged it right before acting.

## non-goals

- Changing the lease window, the abandonment thresholds or the adoption flow.
- Changing how `work publish` or `work retire` remove a unit's own worktree.

## slices

- global_gate: none

### S1 — One liveness judgement; the branch goes before the worktree
- **Status**: in-progress
- **Files**: `packages/core/src/lib/work-units/unit-liveness.service.ts`, `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/work-units/unit-removal.service.ts`, `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/src/lib/work-units/finished-units-end.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/orphaned-work.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/src/lib/work-units/workflow-doctor.service.ts`, `packages/core/tests/src/lib/work-units/unit-liveness.service.spec.ts`, `packages/core/tests/src/lib/work-units/unit-removal.service.spec.ts`, `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`
- **Gate**: none
- acceptance:
  - "A unit whose lease heartbeat is inside the lease window is judged alive and is never reaped, ended, listed abandoned by the doctor or reported orphaned."
  - "A unit with a proof in flight (a live claimant of its proof turn) or a live process whose working directory is inside its worktree is judged alive and is never reaped."
  - "removeUnitCheckout deletes the branch by compare-and-swap at the judged tip before it removes the worktree; a ref that moved between judgement and removal aborts the removal with the worktree in place."
  - "Liveness is re-checked immediately before the branch deletion and before the worktree removal; a unit that came alive in between gets its branch back at the judged tip and keeps its worktree."
  - "A worktree holding edits that are not kept elsewhere, or a live process, is never removed with --force."
- shipped-in: `d62b6d6e1f79`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Requesting fresh evidence package bound to current tip because current review context has substantial drift and cannot be safely approved as-is.

## acceptance

- A unit whose lease heartbeat is inside the lease window is judged alive and is never reaped, ended, listed abandoned by the doctor or reported orphaned.
- A unit with a proof in flight (a live claimant of its proof turn) or a live process whose working directory is inside its worktree is judged alive and is never reaped.
- removeUnitCheckout deletes the branch by compare-and-swap at the judged tip before it removes the worktree; a ref that moved between judgement and removal aborts the removal with the worktree in place.
- Liveness is re-checked immediately before the branch deletion and before the worktree removal; a unit that came alive in between gets its branch back at the judged tip and keeps its worktree.
- A worktree holding edits that are not kept elsewhere, or a live process, is never removed with --force.
