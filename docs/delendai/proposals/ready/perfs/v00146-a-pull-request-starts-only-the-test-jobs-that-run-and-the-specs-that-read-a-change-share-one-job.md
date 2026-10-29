---
id: v00146
title: "A pull request starts only the test jobs that run, and the specs that read a change share one job"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00146 — A pull request starts only the test jobs that run, and the specs that read a change share one job

## goal

A pull request starts a test job only for work it will do: zones the change does not reach start nothing, and the few specs that read a changed file, across every zone, run in one job.

## why

After v00143 a zone the change does not reach still started its job, which took a runner, checked out and reported `skipped`; a change read by specs in three zones started three jobs of a few specs each. Every job costs about 40 s of setup and a runner from a concurrency the account caps, so on a pull request of 38 jobs the later ones waited for a runner before they began. The matrix kept unreached zones on purpose, so that one missing from the list could not be mistaken for one forgotten; the planner's log now names each zone it does not start, and why.

## non-goals

- Changing which specs a change reaches (v00143).

## slices

- global_gate: type

### S1 — Only the jobs that run, readers merged
- **Status**: pending
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`compactMatrix` keeps the jobs that run, merges every `readers` job into one named `readers` with the union of their specs, and returns a single `none` job when nothing runs (test-zones.script.spec.ts); the planner prints each zone it does not start."

## acceptance

- `compactMatrix` keeps the jobs that run, merges every `readers` job into one named `readers` with the union of their specs, and returns a single `none` job when nothing runs (test-zones.script.spec.ts); the planner prints each zone it does not start.
