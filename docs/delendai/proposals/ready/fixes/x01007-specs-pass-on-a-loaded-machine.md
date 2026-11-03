---
id: x01007
title: "Specs pass on a loaded machine"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# x01007 — Specs pass on a loaded machine

## goal

Six specs failed in proofs on 2026-11-03 while the machine was loaded and passed alone. Each depended on a wall-clock deadline below what a loaded machine needs. Make them deterministic, keeping every assertion.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Close gate and lock chaos specs wait on the work, not the clock
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/tools/close-slice-gate.spec.ts`, `plugins/proposals/tests/src/lib/chaos/coordination-chaos.spec.ts`
- **Gate**: none

### S2 — Process-spawning and measuring specs get ceilings a loaded machine fits under
- **Status**: pending
- **Files**: `packages/cli/src/commands/guard.command.spec.ts`, `tools/scripts/report/token-budget-dashboard.spec.ts`, `tests/e2e/routing/full-pipeline.e2e.spec.ts`
- **Gate**: none

### S3 — Latency overhead is measured in CPU time
- **Status**: pending
- **Files**: `plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
