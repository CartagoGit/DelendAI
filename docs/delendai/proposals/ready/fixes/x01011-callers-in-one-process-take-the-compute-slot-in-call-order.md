---
id: x01011
title: "Callers in one process take the compute slot in call order"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 092b3077-7331-4d22-adb0-513c0efcab15
last-correlation-id: 092b3077-7331-4d22-adb0-513c0efcab15
last-transition-from: review
last-transition-at: 2026-11-04T22:00:59.270Z
---

# x01011 — Callers in one process take the compute slot in call order

## goal

Two callers of the compute slot in one process reach the slot in the order they asked, so a holder's wait cannot be overtaken by a later caller.

## why

Develop's CI failed `compute-slot.service.spec.ts` (two concurrent proofs one after the other): two callers in one process reached the slot in the order their async setup finished, not the order they asked, so the later one could take the slot first. A newer tip of a unit was also not on record until its file write ended, so an older tip could be proved. Both made the proof queue unpredictable and blocked the queue.

## non-goals

- Ordering between processes: the file mutex decides there.
- Changing the cross-process claim files of the unit turn.

## slices

- global_gate: none

### S1 — One process queues for the slot in call order
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: none
- acceptance:
  - "Callers of withComputeSlot in one process take the slot in the order they asked; the spec for two concurrent proofs passes in 20 shuffled runs under load."
- shipped-in: `4feb256abdfd`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Stale due to post-shipped-in drift: `compute-slot.service.ts` and its spec changed after `4feb256abdfd` on develop (`2ca63f042`, `7b8d0fb38`, `597ee7998`, `2f3d58127`). Rebase and re-validate the FIFO evidence on current develop before approval.

## acceptance

- Callers of withComputeSlot in one process take the slot in the order they asked; the spec for two concurrent proofs passes in 20 shuffled runs under load.
