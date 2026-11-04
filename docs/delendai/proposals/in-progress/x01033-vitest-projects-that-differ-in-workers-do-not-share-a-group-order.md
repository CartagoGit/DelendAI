---
id: x01033
title: "Vitest projects that differ in workers do not share a group order"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-04
last-transition-id: 96fa602a-49cd-442c-95f9-92c9986c39b4
last-correlation-id: 96fa602a-49cd-442c-95f9-92c9986c39b4
last-transition-from: ready
last-transition-at: 2026-11-04T19:18:59.121Z
---

# x01033 — Vitest projects that differ in workers do not share a group order

## goal

Running the core and proposals projects together no longer fails before any test, because a project that runs its files one at a time has its own sequence.groupOrder.

## why

x01019 gave every shared-graph project groupOrder 1, but proposals runs with fileParallelism false and so has different maxWorkers; vitest refuses that pair with 'Projects core and proposals have different maxWorkers but same sequence.groupOrder', which failed the readers test job on every PR. Reproduced with vitest run --project core --project proposals --maxWorkers=2.

## non-goals

- The shared-graph isolation split of x01019 stays as it is.

## slices

- global_gate: none

### S1 — Give the serial project its own group order
- **Status**: pending
- **Files**: `vitest.shared.ts`, `plugins/proposals/vitest.config.ts`, `tools/scripts/test/vitest-group-order.spec.ts`
- **Gate**: none
- acceptance:
  - "vitest run with the core and proposals projects together resolves their group orders without error, checked by a spec."

## acceptance

- vitest run with the core and proposals projects together resolves their group orders without error, checked by a spec.
