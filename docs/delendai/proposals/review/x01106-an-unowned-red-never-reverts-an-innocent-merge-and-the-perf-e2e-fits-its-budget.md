---
id: x01106
title: "An unowned red never reverts an innocent merge and the perf e2e fits its budget"
kind: fix
status: review
type: proposal
track: trust
date: 2026-11-21
last-transition-id: 5ffcdfed-ac2e-4c4b-ba77-c481fab102a4
last-correlation-id: 5ffcdfed-ac2e-4c4b-ba77-c481fab102a4
last-transition-from: in-progress
last-transition-at: 2026-11-21T01:52:43.149Z
---

# x01106 — An unowned red never reverts an innocent merge and the perf e2e fits its budget

## goal

land-repair reverts only a merge whose footprint reaches the failure; a red nobody owns is recorded as an unowned failure. The flame-graph e2e spec gets a budget above its profiler deadline, taken from a measurement.

## why

Develop CI run 44847077923 (commit 4f6a215fe, merge of #3276, CLI-only) went red on plugins/perf real-perf-profile-deps.e2e.spec.ts, which timed out at 20341 ms against a budget and a profiler deadline that are both 20000 ms. land-repair then reverted the earliest merge, the innocent #3276 (PR #3279), because it reverts the earliest merge when no footprint reaches the failure. A flaky spec plus that fallback punishes unrelated work.

## non-goals

- Changing attributeCulprit or the footprint model
- Changing what the perf profiler reports
- Re-running specs to hide flakiness

## slices

- global_gate: none

### S1 — Unowned red reverts nobody
- **Status**: review
- **Files**: `packages/core/src/lib/integration/land/land-repair.helper.ts`, `packages/core/src/lib/integration/land/land-revert.interface.ts`, `packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red whose failing zone and specs no merge since the last green reaches opens no revert, records the failures as known-failing for that commit and returns kind 'unowned'"
  - "packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red that one merge's footprint reaches still reverts that merge"
  - "packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: with no footprint reaching the failure, diagnoseDevelopRed names no revertFirst, so nothing is reverted"
- shipped-in: `261ee06a2ff5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Perf flame-graph e2e budget from a measurement
- **Status**: review
- **Files**: `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts: the budget in the test name exceeds the profiler deadline, so a slow run fails with the deadline message rather than at the boundary"
  - "plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts: the measured time of the profiling run and of --prof-process is recorded in the spec comment"
- shipped-in: `261ee06a2ff5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red whose failing zone and specs no merge since the last green reaches opens no revert, records the failures as known-failing for that commit and returns kind 'unowned'
- packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red that one merge's footprint reaches still reverts that merge
- packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: with no footprint reaching the failure, diagnoseDevelopRed names no revertFirst, so nothing is reverted
- plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts: the budget in the test name exceeds the profiler deadline, so a slow run fails with the deadline message rather than at the boundary
- plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts: the measured time of the profiling run and of --prof-process is recorded in the spec comment
