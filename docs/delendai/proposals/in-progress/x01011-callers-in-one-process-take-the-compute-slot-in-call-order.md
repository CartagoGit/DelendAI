---
id: x01011
title: "Callers in one process take the compute slot in call order"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 62759aba-7d6c-4929-842b-55e701e67c68
last-correlation-id: 62759aba-7d6c-4929-842b-55e701e67c68
last-transition-from: ready
last-transition-at: 2026-11-03T17:05:59.122Z
---

# x01011 — Callers in one process take the compute slot in call order

## goal

Two callers of the compute slot in one process reach the slot in the order they asked, so a holder's wait cannot be overtaken by a later caller.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — One process queues for the slot in call order
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: none
- acceptance:
  - "Callers of withComputeSlot in one process take the slot in the order they asked; the spec for two concurrent proofs passes in 20 shuffled runs under load."

## acceptance

- Callers of withComputeSlot in one process take the slot in the order they asked; the spec for two concurrent proofs passes in 20 shuffled runs under load.
