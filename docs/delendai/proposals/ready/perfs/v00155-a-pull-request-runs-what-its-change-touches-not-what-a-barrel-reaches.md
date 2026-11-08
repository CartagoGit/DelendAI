---
id: v00155
title: "A pull request runs what its change touches, not what a barrel reaches"
kind: perf
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-08
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
- **Status**: pending
- **Files**: `tools/scripts/ci/export-delta.ts`, `tools/scripts/ci/export-delta.spec.ts`, `tools/scripts/ci/test-scope.ts`, `tools/scripts/ci/test-scope.spec.ts`, `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.script.spec.ts`
- **Gate**: none
- acceptance:
  - "A changed barrel or entry file that declares nothing itself selects only the specs that import a name whose export was added, removed or re-pointed, plus mirror specs and the direct specs of a changed spec."
  - "Adding one export to a cli.ts-shaped barrel selects only that export's importers' specs, not the specs of the other names."
  - "The forge test plan (test-zones) reads testing.scope from delendai.config.json: touched by default, reach for the symbol-reach analysis, all for every spec."

### S2 — No declared-always job without a reason in code
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: none
- acceptance:
  - "Each job that declared always declares the paths it reads, or carries a one-line reason why it truly needs the whole repository; wake-the-queue and delendai-validate may stay always as bookkeeping."
  - "A spec records which jobs run for a docs-only change and for a tools-only change."

### S3 — Packaging jobs run on a change of a published surface or build input
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/ci/job-reach.helper.ts`, `tools/scripts/ci/job-reach.helper.spec.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`
- **Gate**: none
- acceptance:
  - "site, pack-smoke, build-clean, verify-runtime and delendai-rebuild-digest run only when a published package's public surface or a build input changes, judged at symbol level for a barrel."
  - "Adding one export to a barrel runs the packaging jobs; a body change inside a module behind the barrel does not."

### S4 — Fewer jobs: the lint jobs that run together share one setup
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `.github/workflows/ci.yml`
- **Gate**: none
- acceptance:
  - "The lint jobs that run together are one job with one setup; a separate check name remains only where branch protection requires it."
  - "The proposal states the runner-minutes of a PR 1838-like change before and after."

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
