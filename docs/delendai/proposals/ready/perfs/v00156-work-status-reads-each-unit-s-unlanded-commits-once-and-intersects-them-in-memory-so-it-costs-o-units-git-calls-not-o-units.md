---
id: v00156
title: "work status reads each unit's unlanded commits once and intersects them in memory, so it costs O(units) git calls, not O(units²)"
kind: perf
status: ready
type: proposal
track: general
date: 2026-11-17
---

# v00156 — work status reads each unit's unlanded commits once and intersects them in memory, so it costs O(units) git calls, not O(units²)

## goal

Make `work status` cost O(live units) git calls. Today relationsOf (packages/core/src/lib/work-units/work-swarm-relations.service.ts) asks sharedUnlandedCommits (work-swarm.service.ts) for every PAIR of live units: one `git merge-base <tipL> <tipR>` plus one `rev-list --count` per pair. With ~60 live units that is ~1,570 pair calls out of ~2,044 git processes and 30-58 s of wall time (evidence: profile 2026-11-17, 98% of CPU is spawnSync). Decision: no cache across invocations; correctness first. Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage`.

## why

Measured before (this repo, 60ish live units, nice -n 19): 2,044 git execs (1,627 merge-base, of which 1,568 pairwise), 30.1 s wall plain. The after numbers (git process count and wall time of `work status` in this repo) are recorded here and in the commit body once the slice is implemented.

## non-goals

- No cache across invocations: every run reads the repository as it is.
- No change to the relations output.

## slices

- global_gate: none

### S1 — Read each unit's unlanded commits once; intersect in memory
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-swarm-relations.service.ts`, `packages/core/src/lib/work-units/work-swarm.service.ts`
- **Gate**: type
- acceptance:
  - "For each live unit the unlanded commit set is read once (`git rev-list <integration>..<tip>`, or one batched call if the existing git port offers it); pairwise shared counts are computed in memory."
  - "A spec with a fake git port and N=5 units counts git calls and expects them linear in N: no call takes two unit tips. New spec files, if any, are named in the slice prose and sit beside the existing specs of these two services."
  - "The relations output (shared counts per pair) is identical to today's for a fixture with overlapping and disjoint units."
  - "Measured: git process count and wall time of `work status` in this repo before and after are written in the proposal's why and in the commit body."
  - "Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage`."

## acceptance

- For each live unit the unlanded commit set is read once (`git rev-list <integration>..<tip>`, or one batched call if the existing git port offers it); pairwise shared counts are computed in memory.
- A spec with a fake git port and N=5 units counts git calls and expects them linear in N: no call takes two unit tips. New spec files, if any, are named in the slice prose and sit beside the existing specs of these two services.
- The relations output (shared counts per pair) is identical to today's for a fixture with overlapping and disjoint units.
- Measured: git process count and wall time of `work status` in this repo before and after are written in the proposal's why and in the commit body.
- Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage`.
