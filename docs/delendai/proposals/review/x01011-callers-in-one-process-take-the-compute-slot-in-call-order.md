---
id: x01011
title: "Callers in one process take the compute slot in call order"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: e9b15f38-0c5c-4d19-b452-e0367756f2af
last-correlation-id: e9b15f38-0c5c-4d19-b452-e0367756f2af
last-transition-from: in-progress
last-transition-at: 2026-11-03T19:56:55.356Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: none
- acceptance:
  - "Callers of withComputeSlot in one process take the slot in the order they asked; the spec for two concurrent proofs passes in 20 shuffled runs under load."
- shipped-in: `4feb256abdfd`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Callers of withComputeSlot in one process take the slot in the order they asked; the spec for two concurrent proofs passes in 20 shuffled runs under load.
