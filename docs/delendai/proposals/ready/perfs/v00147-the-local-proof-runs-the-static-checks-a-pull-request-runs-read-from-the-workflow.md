---
id: v00147
title: "The local proof runs the static checks a pull request runs, read from the workflow"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00147 — The local proof runs the static checks a pull request runs, read from the workflow

## goal

Before a unit is published, the proof runs every static check the forge will run on its pull request, with the same commands, read from `ci.yml` itself, so a lint that would fail on the forge fails locally first. The checks run concurrently, so this costs about a minute and a half, not the five minutes they add up to.

## why

The proposal first set out to merge the pull request's static-check jobs into one, to save setups. Measured, that saves nothing worth having:

- **Money.** The repository is public, so GitHub Actions minutes on its standard runners cost nothing.
- **Slots.** Runners do not queue: across 543 jobs in the busiest window of 2026-10-28, the median wait was 2 s.
- **Wall time.** The static jobs end long before the test shards.

Merging would also take away the per-check names the queue reads. `candidate-disposition.constant.ts` decides from them whether a red candidate only needs its derived files regenerated.

What did cost a full forge cycle, the same day, is the opposite gap. The local proof (f00796) ran four gates listed by hand, while a pull request runs nine jobs of lints. #1582 went red on `spec-timeout-undercut`, which nothing local ran.

Running the nine jobs' commands locally, as `ci.yml` writes them, found three more things on the first try:

- `config-jsonc-only` passed over a tree with no sources. `no-silent-gates` flags that locally, while the forge's probe of it is blind.
- `lint:publication-proof` reads stdin, so a runner that leaves stdin open waits forever.
- `quality-gate` rebuilds `build/` while `lint-presets` walks it. On the forge they are separate runners; on one machine the walk failed on a file that vanished under it.

Measured: the nine jobs take about 290 s one after another, and 92 s together with the typecheck on a 10-core machine (`quality-gate` after, alone). The whole fast proof takes 153 s.

## non-goals

- Merging the forge's jobs. That was the first scope, withdrawn for the reasons above.
- A second list of checks: the steps are read from `ci.yml`, so a lint added to a job is proved locally the same day.

## slices

- global_gate: type

### S1 — The static checks are read from the workflow
- **Status**: pending
- **Files**: `tools/scripts/ci/ci-static-steps.ts`, `tools/scripts/ci/ci-static-steps.spec.ts`, `tools/scripts/lint/config-jsonc-only.script.ts`
- **Gate**: type
- acceptance:
  - "`staticChecksOf` returns each static job of `ci.yml` (`STATIC_CHECK_JOBS`) as one bash script, with the expressions a pull request's run resolves (its base commit, its base branch, the token) replaced by their local meaning. It refuses a step with any other expression and a workflow missing one of the jobs, and the real `ci.yml` resolves completely (ci-static-steps.spec.ts). `config-jsonc-only` refuses a tree without `packages/` or `plugins/` (`no-silent-gates` passes locally)."

### S2 — The proof runs them, together, before the tests
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`bun run prove` (and `prove:plan`) runs the typecheck and the static checks concurrently, up to the machine's cores, each with stdin closed. It then runs the checks in `RUN_ALONE` (`quality-gate`) one at a time, prints each check's verdict and time and the tail of a failed one's output, and fails when any fails. Measured on this repository: 153 s for the whole fast proof."

## acceptance

- `staticChecksOf` returns each static job of `ci.yml` (`STATIC_CHECK_JOBS`) as one bash script, with the expressions a pull request's run resolves (its base commit, its base branch, the token) replaced by their local meaning. It refuses a step with any other expression and a workflow missing one of the jobs, and the real `ci.yml` resolves completely (ci-static-steps.spec.ts). `config-jsonc-only` refuses a tree without `packages/` or `plugins/` (`no-silent-gates` passes locally).
- `bun run prove` (and `prove:plan`) runs the typecheck and the static checks concurrently, up to the machine's cores, each with stdin closed. It then runs the checks in `RUN_ALONE` (`quality-gate`) one at a time, prints each check's verdict and time and the tail of a failed one's output, and fails when any fails. Measured on this repository: 153 s for the whole fast proof.
