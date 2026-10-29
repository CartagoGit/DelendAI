---
id: v00146
title: "A pull request starts only the test jobs that run, and the specs that read a change share one job"
kind: perf
status: in-progress
type: proposal
track: ci
date: 2026-10-29
last-transition-id: f292be32-64a2-44df-b599-3eafb680a3bb
last-correlation-id: f292be32-64a2-44df-b599-3eafb680a3bb
last-transition-from: review
last-transition-at: 2026-10-29T14:15:40.924Z
---

# v00146 — A pull request starts only the test jobs that run, and the specs that read a change share one job

## goal

A pull request starts a test job only for work it will do: zones the change does not reach start nothing, and the few specs that read a changed file, across every zone, run in one job.

## why

After v00143 a zone the change does not reach still started its job, which took a runner, checked out and reported `skipped`; a change read by specs in three zones started three jobs of a few specs each. Every job costs about 40 s of setup and a runner from a concurrency the account caps, so on a pull request of 38 jobs the later ones waited for a runner before they began. The jobs that did run started late and ran long: `plan-tests` waited for `typecheck` and `lint-biome` (~30 s each, in parallel), so the shards began at +68 s, and every shard instrumented the whole repository for coverage although a pull request is judged only on the files it touched — measured on one zone, 54 s with every file instrumented and 23 s with the touched one. And a green pull request waited for the queue's hourly run to be armed, because only a certification of develop woke it; a README or agent-brief edit ran every shard; and a workflow edit ran its zones unfiltered although the read map names the specs that read it. The matrix kept unreached zones on purpose, so that one missing from the list could not be mistaken for one forgotten; the planner's log now names each zone it does not start, and why.

## non-goals

- Changing which specs a change reaches (v00143).

## slices

- global_gate: type

### S1 — Only the jobs that run, readers merged
- **Status**: review
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`compactMatrix` keeps the jobs that run, merges every `readers` job into one named `readers` with the union of their specs, and returns a single `none` job when nothing runs (test-zones.script.spec.ts); the planner prints each zone it does not start."
- shipped-in: `ff793d6e4a20`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The tests plan without waiting for the type and format checks
- **Status**: review
- **Files**: `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "`plan-tests` declares no `needs`, so the test shards start beside `typecheck` and `lint-biome`, and `delendai-validate` still requires both."
- shipped-in: `77f910e98f4e`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A pull request instruments only the files it touched
- **Status**: review
- **Files**: `vitest.config.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "On a pull request the shards and the merge set `VITEST_COVERAGE_FILES` to the files changed since the base, and `vitest.config.ts` narrows `coverage.include` to those of them its globs already select (a file outside them stays unmeasured, and none touched measures nothing), so the changed-file coverage verdict is the one the full selection gives."
- shipped-in: `77f910e98f4e`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A publication that goes green wakes the queue
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/forge/certify-integration.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A publication whose `delendai-validate` goes green dispatches the queue (`wake-the-queue` in ci.yml, own `delendai/pr/` branches only; certify-integration.script.spec.ts), so it is armed within minutes with every other green candidate instead of at the next hourly run."

### S5 — Prose reaches its readers, and readers run beside a changed zone
- **Status**: pending
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.interface.ts`, `tools/scripts/ci/test-zones.script.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "A changed root `*.md`, `LICENSE`, `.mailmap` or `.github/` file outside workflows and actions reaches only the specs that read it, while configuration (`delendai.config.json`, `package.json`, the lockfile, `tsconfig`, the vitest configs) still runs every zone (zone-reads.spec.ts); in a zone its code reaches too, the specs that read the root file run in the shared readers job (test-zones.script.spec.ts), so the shard step no longer runs a zone unfiltered because a workflow or `.yml` changed."

## acceptance

- `compactMatrix` keeps the jobs that run, merges every `readers` job into one named `readers` with the union of their specs, and returns a single `none` job when nothing runs (test-zones.script.spec.ts); the planner prints each zone it does not start.
- `plan-tests` declares no `needs`, so the test shards start beside `typecheck` and `lint-biome`, and `delendai-validate` still requires both.
- On a pull request the shards and the merge set `VITEST_COVERAGE_FILES` to the files changed since the base, and `vitest.config.ts` narrows `coverage.include` to those of them its globs already select (a file outside them stays unmeasured, and none touched measures nothing), so the changed-file coverage verdict is the one the full selection gives.
- A publication whose `delendai-validate` goes green dispatches the queue (`wake-the-queue` in ci.yml, own `delendai/pr/` branches only; certify-integration.script.spec.ts), so it is armed within minutes with every other green candidate instead of at the next hourly run.
- A changed root `*.md`, `LICENSE`, `.mailmap` or `.github/` file outside workflows and actions reaches only the specs that read it, while configuration (`delendai.config.json`, `package.json`, the lockfile, `tsconfig`, the vitest configs) still runs every zone (zone-reads.spec.ts); in a zone its code reaches too, the specs that read the root file run in the shared readers job (test-zones.script.spec.ts), so the shard step no longer runs a zone unfiltered because a workflow or `.yml` changed.
