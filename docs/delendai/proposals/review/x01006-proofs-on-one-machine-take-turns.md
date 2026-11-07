---
id: x01006
title: "Proofs on one machine take turns"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: cc3f535b-2c43-4e80-a471-09860a6797e2
last-correlation-id: cc3f535b-2c43-4e80-a471-09860a6797e2
last-transition-from: in-progress
last-transition-at: 2026-11-03T02:26:14.683Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/lib/contracts/constants/compute-slot.constant.ts`, `packages/core/src/lib/contracts/interfaces/compute-slot.interface.ts`, `tools/scripts/lib/with-compute-lock.script.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`
- **Gate**: none
- acceptance:
  - "Two concurrent proofs run one after the other and the waiter names the holder."
  - "A holder killed without releasing frees the slot for the next caller."
- shipped-in: `a00512b96772`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Two concurrent proofs run one after the other and the waiter names the holder.
- A holder killed without releasing frees the slot for the next caller.
