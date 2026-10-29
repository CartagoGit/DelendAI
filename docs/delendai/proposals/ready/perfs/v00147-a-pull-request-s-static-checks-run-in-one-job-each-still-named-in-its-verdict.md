---
id: v00147
title: "A pull request's static checks run in one job, each still named in its verdict"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00147 — A pull request's static checks run in one job, each still named in its verdict

## goal

A pull request pays one setup for its static checks instead of one per check. The lints, manifests, generated-artifact and governance checks its change reaches run in one job, concurrently. Each one still reports by its own name, so a failure says which check failed and why.

## why

Measured on #1577 (2026-10-29): the CI workflow started 36 jobs and spent 51 runner-minutes, 14 of them on setup (checkout, Bun, install: 18-34 s per job). A small pull request (#1575) still started 19 jobs for 13 runner-minutes. About twelve of those jobs are static checks that each spend 20-30 s preparing to run a script that takes 5-40 s: lint-governance, lint-security, lint-presets, lint-architecture, lint-docs, manifests-check, generated-artifacts-check, quality-gate, tokens-budget-real, build-clean, the metrics gate and lint-biome.

Runners did not queue: across 543 jobs in the busiest window of 2026-10-28 the median wait was 2 s. So the cost is runner-minutes and setup wall time, not slots: one setup instead of twelve saves about 5 runner-minutes per pull request. The job's wall time is the slowest check instead of the sum of setups.

## non-goals

- Checks that need their own permissions or history stay their own jobs, so no check gains a permission it does not need: develop-protection-live (reads the live branch rule), ref-lifecycle (reads the forge's refs), CodeQL.
- typecheck, the test zones, verify-runtime and the web build stay separate: they take minutes, and their results feed other jobs.
- Weakening a check or changing what a change reaches (`job-scope` decides that, unchanged).

## slices

- global_gate: type

### S1 — One list of the static checks
- **Status**: pending
- **Files**: `tools/scripts/ci/static-checks.constant.ts`, `tools/scripts/ci/static-checks.script.ts`, `tools/scripts/ci/static-checks.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`static-checks.constant.ts` lists each static check once, by the job name job-scope knows it by, with the commands its job ran; `static-checks.script.ts --plan=<plan-scope output>` runs the checks the plan reaches, concurrently up to the runner's cores, prints each one's output in its own group and a table of name, verdict and time, and exits non-zero when any fails (static-checks.script.spec.ts)."

### S2 — The workflow runs them in one job
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "ci.yml has one `static-checks` job in place of the listed jobs, with the union of their checkout depth and no permission any of them lacked; `delendai-validate` needs it, and a failing check fails the job with its name in the step summary. A spec pins that every listed check is run by the job and that no job of the old list remains (job-scope.script.spec.ts)."

## acceptance

- `static-checks.constant.ts` lists each static check once, by the job name job-scope knows it by, with the commands its job ran; `static-checks.script.ts --plan=<plan-scope output>` runs the checks the plan reaches, concurrently up to the runner's cores, prints each one's output in its own group and a table of name, verdict and time, and exits non-zero when any fails (static-checks.script.spec.ts).
- ci.yml has one `static-checks` job in place of the listed jobs, with the union of their checkout depth and no permission any of them lacked; `delendai-validate` needs it, and a failing check fails the job with its name in the step summary. A spec pins that every listed check is run by the job and that no job of the old list remains (job-scope.script.spec.ts).
