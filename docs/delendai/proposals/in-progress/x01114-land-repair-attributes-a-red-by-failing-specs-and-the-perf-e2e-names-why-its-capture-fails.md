---
id: x01114
title: "Land-repair attributes a red by failing specs and the perf e2e names why its capture fails"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-11-21
last-transition-id: 3fd065a1-3e25-4444-b744-c6fe915a2377
last-correlation-id: 3fd065a1-3e25-4444-b744-c6fe915a2377
last-transition-from: review
last-transition-at: 2026-11-21T06:29:22.046Z
---

# x01114 — Land-repair attributes a red by failing specs and the perf e2e names why its capture fails

## goal

land-repair reverts a merge only when a failing SPEC is in that merge's footprint; zone-level info alone reverts nobody. The perf flame-graph e2e prints the capture error on failure and the real cause of the failed capture is fixed.

## why

Follow-up of x01106. Develop bc5442a9a (merge of #3337) went red only on real-perf-profile-deps.e2e.spec.ts and land-repair opened #3359 reverting the innocent #3337: sectionOfCheck maps the failing check 'tests: plugins 1/4' to a whole zone, so any merge touching that zone reached it. The same spec returned ok:false at 20.6 s in CI run 44868364091, a flake whose cause was never printed.

## non-goals

- Re-running specs or widening margins to hide the flake
- Changing attributeCulprit

## slices

- global_gate: none

### S1 — Attribute a red by failing specs, not zones
- **Status**: review
- **Files**: `packages/core/src/lib/integration/land/land-repair.helper.ts`, `packages/core/src/lib/integration/land/land-revert.interface.ts`, `packages/core/src/lib/integration/land/github-land-forge.service.ts`, `plugins/integration/src/lib/services/integration-repair.service.ts`, `packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts`, `packages/core/tests/src/lib/integration/land/github-land-forge.service.spec.ts`, `package.json`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red shard whose failing spec is outside every merge footprint reverts nobody and returns unowned"
  - "packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red whose only failure is a zone-level check name reverts nobody"
  - "packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a failing spec inside one merge footprint still reverts that merge"
  - "packages/core/tests/src/lib/integration/land/github-land-forge.service.spec.ts: a failed check reports the spec paths of its annotations as failingSpecs"
- shipped-in: `b80afab23220`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Perf profile e2e prints its error and the capture failure is fixed
- **Status**: review
- **Files**: `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts: a failed capture prints the run's error and stderr in the assertion message"
- shipped-in: `b80afab23220`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red shard whose failing spec is outside every merge footprint reverts nobody and returns unowned
- packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a red whose only failure is a zone-level check name reverts nobody
- packages/core/tests/src/lib/integration/land/land-repair.helper.spec.ts: a failing spec inside one merge footprint still reverts that merge
- packages/core/tests/src/lib/integration/land/github-land-forge.service.spec.ts: a failed check reports the spec paths of its annotations as failingSpecs
- plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts: a failed capture prints the run's error and stderr in the assertion message
