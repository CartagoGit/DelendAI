---
id: x01006
title: "Proofs on one machine take turns"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: e3d51649-273b-4595-b0f9-f930f7e6b1ae
last-correlation-id: e3d51649-273b-4595-b0f9-f930f7e6b1ae
last-transition-from: ready
last-transition-at: 2026-11-03T01:11:02.310Z
---

# x01006 — Proofs on one machine take turns

## goal

A unit proof waits for the machine's one compute slot (shared with test/typecheck/lint), says who holds it, and releases it when it ends or its holder dies.

## why

On 2026-11-03 several agents proved units at once on one machine (load 20-30): each proof took 30-60 minutes, timing-sensitive specs failed and a CLI call to the MCP server timed out. Running them one at a time under flock fixed it, so the product must serialise proofs itself instead of relying on each agent to do so.

## non-goals

- No new locking mechanism: the existing file mutex and the compute-lock script are reused.
- No change to what a proof runs or to how a passing proof is remembered.

## slices

- global_gate: none

### S1 — Put the proof under the compute slot
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/lib/contracts/constants/compute-slot.constant.ts`, `packages/core/src/lib/contracts/interfaces/compute-slot.interface.ts`, `tools/scripts/lib/with-compute-lock.script.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: none
- acceptance:
  - "Two concurrent proofs run one after the other and the waiter names the holder."
  - "A holder killed without releasing frees the slot for the next caller."

## acceptance

- Two concurrent proofs run one after the other and the waiter names the holder.
- A holder killed without releasing frees the slot for the next caller.
