---
id: x00641
title: "A hung CI run cannot hold the queue"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00637, x00636]
last-transition-id: 4a576dd3-9611-4f15-9fa7-669e7daf4204
last-correlation-id: 4a576dd3-9611-4f15-9fa7-669e7daf4204
last-transition-from: in-progress
shipped-in:
  - "ed910e0e5c4e"
---

# x00641 — A hung CI run cannot hold the queue

## goal

A CI job that stops making progress ends within a bounded time, and the
queue that waits on it can move again without a person noticing.

## why

Observed on 2026-09-25. The dispatched full run certifying `develop` at
`1a0496434` sat in its "Setup repo" step on twelve jobs for two hours,
and the queue's own run stayed `in_progress` with every step completed.
The queue arms a candidate only on a certified integration tip (x00637
S3), so nothing merged for those two hours while ten green pull requests
waited. The run was cancelled by hand and re-dispatched; it went green.

Thirty-one of the fifty jobs across `.github/workflows` declared no
`timeout-minutes`, which on GitHub means six hours. The slowest job of a
green full run took about seven minutes.

## why this design

- The bound belongs on each job, where GitHub enforces it, rather than in
  a watchdog: a watchdog is one more thing that can stop running.
- `workflow-yaml` already checks that every job has `runs-on` and `steps`;
  a declared, bounded timeout is the same kind of shape rule, so it lives
  there and reaches CI through the chain that already runs it.
- Jobs that call a reusable workflow cannot declare one; the called
  workflow's jobs do, and the rule reads those files too.

## non-goals

- Retrying jobs. A timed-out job fails; whether to run again is S2's
  question, answered from evidence, not by retrying blindly.

## architecture

- `tools/scripts/lint/workflow-yaml.script.ts`: a job without `uses:` must
  declare `timeout-minutes` as a whole number from 1 to
  `MAX_JOB_TIMEOUT_MINUTES` (60).
- `tools/scripts/lint/workflow-yaml.constant.ts`: that bound, and the job
  keys GitHub accepts (moved out of the script to keep it under the size
  gate).
- Every workflow job: 15 minutes, 30 for test shards and release jobs, 60
  for CodeQL.

## Slices

- global_gate: none

### S1 — Every job declares a bounded timeout

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lint/workflow-yaml.script.spec.ts`
- **Files**: `tools/scripts/lint/workflow-yaml.script.ts`,
  `tools/scripts/lint/workflow-yaml.constant.ts`,
  `tools/scripts/lint/workflow-yaml.script.spec.ts`,
  `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`,
  `.github/workflows/forward-sync-release.yml`,
  `.github/workflows/keep-the-queue-moving.yml`,
  `.github/workflows/pages.yml`, `.github/workflows/release.yml`,
  `.github/workflows/surface-bootstrap.yml`
- shipped-in: `ed910e0e5c4e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — Verifiqué que el lint obliga timeouts acotados por job y que los workflows declarados reciben esos límites; gate declarado de S1 verde: 25/25 y bun run lint:workflow-yaml verde.
- review-attribution: claude-opus-5-5 from commit ed910e0e5c4e names refs/heads/delendai/wip/claude-opus-5-5/x00641-all-g1/every-job-declares-its-timeout (ed910e0e5c4ec324dd09924a0468f7c8e457697e), opened by gpt-5.4

### S2 — A run that timed out is re-dispatched, not read as red

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/forge/certify-integration.script.spec.ts`
- **Files**: `tools/scripts/forge/certify-integration.script.ts`,
  `tools/scripts/forge/certify-integration.interface.ts`,
  `tools/scripts/forge/certify-integration.script.spec.ts`

With S1 a hung job ends, but the run it belongs to then ends
unsuccessful, and a red certification stops the queue until someone runs
the whole workflow again (x00637). `certify-integration` should tell a
run whose only failures are timed-out or cancelled jobs from a run where
a check failed, and dispatch a fresh run for the first. Before writing
it, capture how the forge reports a job timeout (job `conclusion`, the
run's `conclusion`) from a real timed-out run instead of assuming it.

**Measured 2026-09-29.** Two `quality-gate (collect)` jobs reached their
30-minute bound (runs `36590926775` and `36574889186`). For each, the
job's check run and the workflow run both report `conclusion: cancelled`;
the only difference from a person's cancel is the annotation "The job has
exceeded the maximum execution time of 30m0s". So a timed-out run is not
read as red: `certificationOf` and `needsCertification` already ignore a
cancelled run, and the next pass dispatches a fresh one.

What was missing is the other side: a commit whose full run is cancelled
every time (a job that always hangs) would be dispatched again on every
pass, for ever. `MAX_CANCELLED_FULL_RUNS` (3) bounds it: after that many
cancelled full runs and none that finished, `needsCertification` stops
starting another, the certification is `red`, and the pass says why. A
run that finishes still decides, whatever was cancelled before it.
- shipped-in: `144a8768a906`

## dependency graph

S2 depends on S1: until jobs time out there is no timed-out run to
classify.

## acceptance

- `bun run lint:workflow-yaml` refuses a job without `timeout-minutes`,
  or with a value outside 1–60, and names the job and its line.
- Every workflow in the repository passes it.
- (S2) A certification whose run timed out dispatches a new full run
  without a person.

## risks and mitigations

- **A legitimately slow job hits its bound.** The bounds are two to four
  times the slowest measured job; raising one is a one-line change that
  review sees, and the ceiling keeps it from going back to six hours.

## notes

The hang was cleared by cancelling run `36082255169` and re-dispatching
with `certify-integration --apply`; `needsCertification` already ignores
a cancelled run, which is what made the re-dispatch possible.
