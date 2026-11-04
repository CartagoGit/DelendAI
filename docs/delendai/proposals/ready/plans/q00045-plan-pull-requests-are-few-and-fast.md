---
id: q00045
title: "Plan: pull requests are few and fast"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# q00045 — Plan: pull requests are few and fast

## goal

A pull request carries a meaningful batch of work, its CI runs exactly what its local proof ran, every spec is near-instant, and a typical pull request is certified in minutes, in every project that uses delendai.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Every spec is near-instant
- **Status**: pending
- **Files**: `tools/scripts/ci/spec-duration-budget.script.ts`
- **Gate**: none
- acceptance:
  - "No spec file outside the declared e2e tier takes over 1 s in CI; the 41 files measured over 5 s on 2026-11-04 are rewritten with in-memory fakes or moved to the e2e tier; a lint reads CI durations and reports any file over 1 s and fails any over 5 s that is not tagged e2e."

### S2 — A pull request runs what its proof ran
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "A pull request runs the tests testing.scope selects, the same set as the local proof, so a pull request is never red on a test the proof did not run; the wider reach runs on the integration branch certification, and a failure there is blamed on the merged pull request and repaired through the urgent lane."

### S3 — Few jobs, each worth its setup
- **Status**: pending
- **Files**: `tools/scripts/ci/test-zones.script.ts`
- **Gate**: none
- acceptance:
  - "The number of test jobs follows the selected work: a small selection runs in one job; dependencies and builds are restored from cache; a typical pull request finishes in under 5 minutes wall and 10 runner-minutes."

### S4 — Small work ships together
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/publication-grouping.service.ts`
- **Gate**: none
- acceptance:
  - "The publisher groups small publications into one pull request by what they change: docs-only proposal work, and fixes under the size limit in disjoint zones, across proposals; slices of one proposal keep the existing size rule; the grouping is decided from the diff, never by hand."

### S5 — Every skip says why
- **Status**: pending
- **Files**: `tools/scripts/ci/job-scope.script.ts`
- **Gate**: none
- acceptance:
  - "Each skipped job names the reason (zone untouched, platform) in the run summary, and an unconditional test skip fails a lint unless it carries a reason and an owner."

## acceptance

- No spec file outside the declared e2e tier takes over 1 s in CI; the 41 files measured over 5 s on 2026-11-04 are rewritten with in-memory fakes or moved to the e2e tier; a lint reads CI durations and reports any file over 1 s and fails any over 5 s that is not tagged e2e.
- A pull request runs the tests testing.scope selects, the same set as the local proof, so a pull request is never red on a test the proof did not run; the wider reach runs on the integration branch certification, and a failure there is blamed on the merged pull request and repaired through the urgent lane.
- The number of test jobs follows the selected work: a small selection runs in one job; dependencies and builds are restored from cache; a typical pull request finishes in under 5 minutes wall and 10 runner-minutes.
- The publisher groups small publications into one pull request by what they change: docs-only proposal work, and fixes under the size limit in disjoint zones, across proposals; slices of one proposal keep the existing size rule; the grouping is decided from the diff, never by hand.
- Each skipped job names the reason (zone untouched, platform) in the run summary, and an unconditional test skip fails a lint unless it carries a reason and an owner.
