---
id: v00148
title: "Test shards are balanced by the time their specs take, not by how many there are"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
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
- **Status**: pending
- **Files**: `tools/scripts/ci/spec-timings.script.ts`, `tools/scripts/ci/spec-timings.script.spec.ts`, `tools/scripts/ci/spec-timings.generated.json`, `biome.json`
- **Gate**: type
- acceptance:
  - "`spec-timings.script.ts --from=<merged blob reports>` writes each spec file's duration to `spec-timings.generated.json`, sorted and stable under biome format; a spec missing from it counts as the zone's median (spec-timings.script.spec.ts)."

### S2 — The planner splits a zone by time
- **Status**: pending
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.script.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "A zone run unfiltered is split into its shards by greedy longest-first assignment over the recorded timings, each matrix job carrying its spec list instead of `--shard`, so every spec runs exactly once and no shard's expected time exceeds the mean by more than the longest single spec (test-zones.script.spec.ts)."

## acceptance

- `spec-timings.script.ts --from=<merged blob reports>` writes each spec file's duration to `spec-timings.generated.json`, sorted and stable under biome format; a spec missing from it counts as the zone's median (spec-timings.script.spec.ts).
- A zone run unfiltered is split into its shards by greedy longest-first assignment over the recorded timings, each matrix job carrying its spec list instead of `--shard`, so every spec runs exactly once and no shard's expected time exceeds the mean by more than the longest single spec (test-zones.script.spec.ts).
