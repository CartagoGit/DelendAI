---
id: v00155
title: "A pull request runs what its change touches, not what a barrel reaches"
kind: perf
status: review
type: proposal
track: a00095-consistency
date: 2026-11-08
last-transition-id: 4acd74d8-70db-43c6-8f9d-28b009d0bc68
last-correlation-id: 4acd74d8-70db-43c6-8f9d-28b009d0bc68
last-transition-from: in-progress
last-transition-at: 2026-11-08T16:26:43.140Z
---

# v00155 — A pull request runs what its change touches, not what a barrel reaches

## goal

A pull request runs the specs, lints, builds and jobs of what its change touches. Adding one export to a barrel runs the specs of that export's importers and no others, and no job runs without a stated reason in code.

## why

Measured on PR #1838 (6 files: one new export in packages/core/src/cli.ts, 2 core files, 1 tools file, 1 spec, 1 proposal doc): CI ran 31 jobs. cli.ts is a barrel, so 'runs the specs its imports reach' selected 862 specs over 7 jobs; 11 jobs were 'declared always'; the barrel also triggered site, pack-smoke, build-clean, verify-runtime, delendai-rebuild-digest and the full typecheck; the proposal doc triggered lint-presets, lint-docs and tokens-budget-real; every job pays 25-30 s of setup. The owner's rule is that a pull request runs only the tests, lints and types of what it touches, and a transitive import through a barrel is not touched. The local proof already honours testing.scope (default touched); CI still uses the symbol-reach analysis.

## non-goals

- Skipping a required check: a job skipped here is still reported to delendai-validate as not applicable.
- Changing what the local proof selects for a non-barrel file.

## slices

- global_gate: none

### S1 — Tests, symbol-level: CI uses testing.scope and a barrel selects the importers of the exports that changed
- **Status**: review
- **Files**: `tools/scripts/ci/export-delta.ts`, `tools/scripts/ci/export-delta.spec.ts`, `tools/scripts/ci/test-scope.ts`, `tools/scripts/ci/test-scope.spec.ts`, `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/test-zones.script.ts`
- **Gate**: none
- acceptance:
  - "A changed barrel or entry file that declares nothing itself selects only the specs that import a name whose export was added, removed or re-pointed, plus mirror specs and the direct specs of a changed spec."
  - "Adding one export to a cli.ts-shaped barrel selects only that export's importers' specs, not the specs of the other names."
  - "The forge test plan (test-zones) reads testing.scope from delendai.config.json: touched by default, reach for the symbol-reach analysis, all for every spec."
- shipped-in: `b97d4e5a0009`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — No declared-always job without a reason in code
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "Each job that declared always declares the paths it reads, or carries a one-line reason why it truly needs the whole repository; wake-the-queue and delendai-validate may stay always as bookkeeping."
  - "A spec records which jobs run for a docs-only change and for a tools-only change."
- shipped-in: `6fcc4940a048`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Packaging jobs run on a change of a published surface or build input
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: none
- acceptance:
  - "site, pack-smoke, build-clean, verify-runtime and delendai-rebuild-digest run only when a published package's public surface or a build input changes, judged at symbol level for a barrel."
  - "Adding one export to a barrel runs the packaging jobs; a body change inside a module behind the barrel does not."
- shipped-in: `6fcc4940a048`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — Fewer jobs: the lint jobs that run together share one setup
- **Status**: review
- **DependsOn**: [S3]
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/ci-static-steps.ts`, `tools/scripts/ci/ci-static-steps.spec.ts`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.script.spec.ts`, `tools/scripts/lint/job-scope-coverage.script.ts`
- **Gate**: none
- acceptance:
  - "The lint jobs that run together are one job with one setup; a separate check name remains only where branch protection requires it."
  - "The proposal states the runner-minutes of a PR 1838-like change before and after."
- shipped-in: `9de3ef6d07f0`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- A changed barrel or entry file that declares nothing itself selects only the specs that import a name whose export was added, removed or re-pointed, plus mirror specs and the direct specs of a changed spec.
- Adding one export to a cli.ts-shaped barrel selects only that export's importers' specs, not the specs of the other names.
- The forge test plan (test-zones) reads testing.scope from delendai.config.json: touched by default, reach for the symbol-reach analysis, all for every spec.
- Each job that declared always declares the paths it reads, or carries a one-line reason why it truly needs the whole repository; wake-the-queue and delendai-validate may stay always as bookkeeping.
- A spec records which jobs run for a docs-only change and for a tools-only change.
- site, pack-smoke, build-clean, verify-runtime and delendai-rebuild-digest run only when a published package's public surface or a build input changes, judged at symbol level for a barrel.
- Adding one export to a barrel runs the packaging jobs; a body change inside a module behind the barrel does not.
- The lint jobs that run together are one job with one setup; a separate check name remains only where branch protection requires it.
- The proposal states the runner-minutes of a PR 1838-like change before and after.

## ledger

PR #1838 as it ran (`bun run ci:cost -- 1838`): 31 jobs, 1,890 runner-seconds (31.5 min), 292 s wall. Its seven test jobs alone took 842 s.

Specs selected for #1838's change (6 files), computed from the repository at that commit: the symbol-reach analysis chose 696 specs (862 on the forge, which also counts the readers of the root files); the touched scope with the export delta chooses 5 (the mirror of each changed file and the importers of the one name `cli.ts` gained).

After, estimated from #1838's measured per-job durations (not yet re-run on the forge):

| Change | Runner-seconds |
| --- | --- |
| Test zones: 7 jobs reduced to the 3 zones holding the 5 specs (core, packages, tools) at about 50 s each | 842 to 150 |
| `ref-lifecycle` (41) and `develop-protection-live` (10): no file they read changed | minus 51 |
| `delendai-rebuild-digest` (28): no manifest or lockfile changed | minus 28 |
| Eight static checks (294 s, each with its own 25-30 s setup) as one job with one setup | 294 to about 130 |
| Total | 1,890 to about 960 (about 16 min) |

`site`, `pack-smoke`, `build-clean`, `verify-runtime` and `metrics-gate` still run for #1838, because it added an export to a published entry file: that moved the public surface, which is what they judge. A change inside a module behind a barrel runs none of the packaging jobs.

Jobs that run for a proposal-only edit after S2: the five whole-repository checks (`lint-architecture`, `lint-security`, `lint-governance`, `generated-artifacts-check`, `quality-gate`) plus `lint-presets`, `lint-docs` and the bookkeeping (`plan-scope`, `delendai-validate`, `release-the-queue`, `wake-the-queue`); `tokens-budget-real` no longer runs. For a change under `tools/` only, no live-forge, metrics, build or packaging job runs.
