---
id: v00148
title: "Test shards are balanced by the time their specs take, not by how many there are"
kind: perf
status: review
type: proposal
track: ci
date: 2026-10-29
last-transition-id: bc2e301b-2f0e-47ba-aedb-a5fbd634e761
last-correlation-id: bc2e301b-2f0e-47ba-aedb-a5fbd634e761
last-transition-from: in-progress
last-transition-at: 2026-10-29T21:07:54.162Z
---

# v00148 — Test shards are balanced by the time their specs take, not by how many there are

## goal

Every shard of a test zone takes about the same time, so a run's wall time is set by the average shard, not the heaviest one.

## why

`vitest --shard=i/n` splits a zone's spec files by count. Their cost is very uneven: on #1577's full run (2026-10-29) the zone shards took between 75 s and 244 s. `proposals 2/2` took 244 s and `proposals 1/2` 236 s, against 90-130 s for most core and tools shards. The test phase ends when the slowest shard does, so most runners sat idle while two ran. Splitting by measured time brings the slowest close to the mean (about 140 s here) with the same number of runners.

## non-goals

- Changing which specs a change reaches (v00143, v00146) or how many runners a zone gets.

## slices

- global_gate: type

### S1 — The time each spec takes is recorded
- **Status**: review
- **Files**: `tools/scripts/ci/spec-timings.ts`, `tools/scripts/ci/spec-timings.spec.ts`, `tools/scripts/ci/spec-timings.script.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "On a full run of the integration branch, the merge of the shards also writes vitest's JSON report (`VITEST_TIMINGS_OUT`). `spec-timings.script.ts` turns it into each spec file's duration, which is uploaded as the `spec-timings` artifact. Both steps are `continue-on-error`: an optimisation never fails the run it measures. Nothing is committed, since a timings file every change rewrote would send open pull requests back (spec-timings.spec.ts)."
- shipped-in: `6a7cbf607025`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The planner splits a zone by time
- **Status**: review
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.interface.ts`, `tools/scripts/ci/test-zones.script.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "`plan-tests` downloads the latest `spec-timings` of the integration branch. A zone split into shards is then divided by longest-first assignment, a spec with no time counting as the zone's median, and each matrix job carries its spec list (`files`) instead of `--shard`. Every spec runs exactly once, and without timings the split is by count as before. The lists travel in the `zone-files` artifact, not the matrix, which the planner refuses over 64 KiB. `proposals` runs on three jobs and `packages` on two, by their measured cost (test-zones.script.spec.ts, spec-timings.spec.ts)."
- shipped-in: `4f03720080cc`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- On a full run of the integration branch, the merge of the shards also writes vitest's JSON report (`VITEST_TIMINGS_OUT`). `spec-timings.script.ts` turns it into each spec file's duration, which is uploaded as the `spec-timings` artifact. Both steps are `continue-on-error`: an optimisation never fails the run it measures. Nothing is committed, since a timings file every change rewrote would send open pull requests back (spec-timings.spec.ts).
- `plan-tests` downloads the latest `spec-timings` of the integration branch. A zone split into shards is then divided by longest-first assignment, a spec with no time counting as the zone's median, and each matrix job carries its spec list (`files`) instead of `--shard`. Every spec runs exactly once, and without timings the split is by count as before. The lists travel in the `zone-files` artifact, not the matrix, which the planner refuses over 64 KiB. `proposals` runs on three jobs and `packages` on two, by their measured cost (test-zones.script.spec.ts, spec-timings.spec.ts).
