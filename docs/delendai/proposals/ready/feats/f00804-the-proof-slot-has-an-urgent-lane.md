---
id: f00804
title: "The proof slot has an urgent lane"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# f00804 — The proof slot has an urgent lane

## goal

A proof that repairs a red integration branch, or states why it is urgent, takes the machine's compute slot next, ahead of every waiting normal proof, without interrupting the one running.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Urgent lane in the compute slot
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/contracts/interfaces/compute-slot.interface.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/lib/contracts/interfaces/unit-proof.interface.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/work-units/urgent-turn.service.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.spec.ts`, `packages/core/tests/src/lib/work-units/urgent-turn.service.spec.ts`, `packages/cli/src/commands/work.command.ts`
- **Gate**: none
- acceptance:
  - "An urgent caller takes the compute slot ahead of every waiting normal caller; a spec shows it."
  - "Two urgent callers run in arrival order, one at a time; a spec shows it."
  - "A proof already running is never interrupted by an urgent caller; a spec shows it."
  - "The urgent turn is recorded with its reason in the slot owner file and an urgent log; a spec shows it."
  - "A unit is urgent when its proposal is a fix and the integration branch latest certification is red, or when --urgent=<reason> is passed to prove, deliver or publish; work status and the waiting message show the urgent lane."

## acceptance

- An urgent caller takes the compute slot ahead of every waiting normal caller; a spec shows it.
- Two urgent callers run in arrival order, one at a time; a spec shows it.
- A proof already running is never interrupted by an urgent caller; a spec shows it.
- The urgent turn is recorded with its reason in the slot owner file and an urgent log; a spec shows it.
- A unit is urgent when its proposal is a fix and the integration branch latest certification is red, or when --urgent=<reason> is passed to prove, deliver or publish; work status and the waiting message show the urgent lane.
