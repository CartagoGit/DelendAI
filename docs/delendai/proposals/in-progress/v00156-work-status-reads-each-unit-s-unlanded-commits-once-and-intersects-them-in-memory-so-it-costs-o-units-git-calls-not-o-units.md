---
id: v00156
title: "work status reads each unit's unlanded commits once and intersects them in memory, so it costs O(units) git calls, not O(units²)"
kind: perf
status: in-progress
type: proposal
track: general
date: 2026-11-17
last-transition-id: 128f186b-fd6b-44a8-a4f1-23456bfcd9fe
last-correlation-id: 128f186b-fd6b-44a8-a4f1-23456bfcd9fe
last-transition-from: review
last-transition-at: 2026-11-18T04:42:42.422Z
---

# v00156 — work status reads each unit's unlanded commits once and intersects them in memory, so it costs O(units) git calls, not O(units²)

## goal

Make `work status` cost O(live units) git calls. Today relationsOf (packages/core/src/lib/work-units/work-swarm-relations.service.ts) asks sharedUnlandedCommits (work-swarm.service.ts) for every PAIR of live units: one `git merge-base <tipL> <tipR>` plus one `rev-list --count` per pair. With ~60 live units that is ~1,570 pair calls out of ~2,044 git processes and 30-58 s of wall time (evidence: profile 2026-11-17, 98% of CPU is spawnSync). Decision: no cache across invocations; correctness first. Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage`.

## why

Measured before (this repo, 60ish live units, nice -n 19): 2,044 git execs (1,627 merge-base, of which 1,568 pairwise), 30.1 s wall plain. The after numbers (git process count and wall time of `work status` in this repo) are below and in the commit body.

Acceptance evidence (d), measured in this repo with `nice -n 19`: `strace -f -e trace=execve` count 2062 before (1627 merge-base) and 528 after (70 merge-base); `work status` wall time 29.7 s before and 7.3 s after.

## non-goals

- No cache across invocations: every run reads the repository as it is.
- No change to the relations output.

## slices

- global_gate: none

### S1 — Read each unit's unlanded commits once; intersect in memory
- **Status**: in-progress
- **Files**: `packages/core/src/lib/work-units/work-swarm-relations.service.ts`, `packages/core/src/lib/work-units/work-swarm.service.ts`
- **Gate**: type
- acceptance:
  - "For each live unit the unlanded commit set is read once (`git rev-list <integration>..<tip>`, or one batched call if the existing git port offers it); pairwise shared counts are computed in memory."
  - "A spec with a fake git port and N=5 units counts git calls and expects them linear in N: no call takes two unit tips. New spec files, if any, are named in the slice prose and sit beside the existing specs of these two services."
  - "The relations output (shared counts per pair) is identical to today's for a fixture with overlapping and disjoint units."
  - "Measured: git process count and wall time of `work status` in this repo before and after are written in the proposal's why and in the commit body."
  - "Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage`."
- shipped-in: `41c340ab115a`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Need empirical acceptance evidence in this review round (validate exit code, test pass/total, and shipped commit hash) so the slice can be approved under current review policy.

## acceptance

- For each live unit the unlanded commit set is read once (`git rev-list <integration>..<tip>`, or one batched call if the existing git port offers it); pairwise shared counts are computed in memory.
- A spec with a fake git port and N=5 units counts git calls and expects them linear in N: no call takes two unit tips. New spec files, if any, are named in the slice prose and sit beside the existing specs of these two services.
- The relations output (shared counts per pair) is identical to today's for a fixture with overlapping and disjoint units.
- Measured: git process count and wall time of `work status` in this repo before and after are written in the proposal's why and in the commit body.
- Pre-check: `delendai work prove --only=typecheck,lint-biome,lint-architecture,changed-file-coverage`.
