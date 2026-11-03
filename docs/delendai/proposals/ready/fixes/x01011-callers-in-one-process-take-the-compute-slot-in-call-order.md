---
id: x01011
title: "Callers in one process take the compute slot in call order"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
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
