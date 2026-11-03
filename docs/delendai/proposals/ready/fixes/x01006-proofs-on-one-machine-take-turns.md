---
id: x01006
title: "Proofs on one machine take turns"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# x01006 — Proofs on one machine take turns

## goal

A unit proof waits for the machine's one compute slot (shared with test/typecheck/lint), says who holds it, and releases it when it ends or its holder dies.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Put the proof under the compute slot
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/runtime/index.ts`, `tools/scripts/lib/with-compute-lock.script.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: none
- acceptance:
  - "Two concurrent proofs run one after the other and the waiter names the holder."
  - "A holder killed without releasing frees the slot for the next caller."

## acceptance

- Two concurrent proofs run one after the other and the waiter names the holder.
- A holder killed without releasing frees the slot for the next caller.
