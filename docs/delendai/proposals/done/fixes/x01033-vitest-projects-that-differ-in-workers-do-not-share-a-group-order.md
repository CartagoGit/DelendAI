---
id: x01033
title: "Vitest projects that differ in workers do not share a group order"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-04
last-transition-id: ed861e59-d6f0-4e1c-81f1-cbe1cd7fb7fc
last-correlation-id: ed861e59-d6f0-4e1c-81f1-cbe1cd7fb7fc
last-transition-from: review
last-transition-at: 2026-11-09T21:19:32.198Z
shipped-in:
  - "b3b7267fc1d3126917ed3bbbf8f9cb4827f46adb"
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
- **Status**: done
- **Files**: `vitest.shared.ts`, `plugins/proposals/vitest.config.ts`, `tools/scripts/test/vitest-group-order.spec.ts`
- **Gate**: none
- acceptance:
  - "vitest run with the core and proposals projects together resolves their group orders without error, checked by a spec."
- shipped-in: `b3b7267fc1d3`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at b3b7267fc1d3, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 1/1: (1) tools/scripts/test/vitest-group-order.spec.ts runs vitest --project core --project proposals --maxWorkers=2 and asserts exit 0 and no maxWorkers/groupOrder cla… — Read b3b7267fc1d3: vitest.shared.ts adds SHARED_GRAPH_GROUP_ORDER {parallel:1, serial:2}; the shared half of isolationSplit uses parallel, plugins/proposals/vitest.config.ts (fileParallelism false) uses serial, so no two shared-graph projects with different maxWorkers share an order. The new spec spawns vitest with --project core --project proposals --maxWorkers=2 and a no-match filter; its asserted text matches vitest's own message ("different 'maxWorkers' but same 'sequence.groupOrder'" in node_modules/vitest/dist) and it also requires exit 0. Ran it on develop: 1/1 pass in 4.3s. Non-goal respected: the isolation split is unchanged beyond the order constant. Minor, not blocking: the spec spawns a full vitest (4.3s locally) close to FAIL_MS=5000 in spec-duration-budget.ts; consider the e2e name if CI times it over.

## acceptance

- vitest run with the core and proposals projects together resolves their group orders without error, checked by a spec.
