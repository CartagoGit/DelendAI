---
id: v00138
title: "CI transforms each module once and keeps its caches between runs"
kind: perf
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# v00138 — CI transforms each module once and keeps its caches between runs

## goal

A pull request's CI spends its time running tests, not transforming modules: vitest's module cache persists between runs, the proposals project stops re-evaluating the same modules per file where isolation allows it, and the run time is measured before and after.

## why

Joint audit a00095. G12: a PR run takes about 16 minutes; vitest reports the proposals project evaluating 1,524 modules 151,382 times. G86: in a local 8-area subset (125 files, 860 tests) vitest spent 77% of its time transforming modules cold, and the cache is not persisted in CI (vitest itself prints the fsModuleCache hint). The discrepancy recorded on G12 stands: isolate:false is not neutral for proposals, whose modules keep module-level state, so isolation may only be relaxed where a spec proves the state is reset.

## non-goals

- Dropping test isolation globally.
- Removing tests to save time.

## slices

- global_gate: type

### S1 — The transform cache persists in CI
- **Status**: pending
- **Files**: `vitest.config.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "vitest runs with fsModuleCache and CI restores and saves its directory keyed on the lockfile and the vitest config; a second run of the same commit reports a lower transform time, recorded in the closing evidence (G86)."

### S2 — proposals evaluates each module once where state allows
- **Status**: pending
- **Files**: `tools/scripts/report/vitest-module-evaluations.script.ts`, `tools/tests/report/vitest-module-evaluations.spec.ts`
- **Gate**: type
- acceptance:
  - "A report script prints module evaluations per project from a vitest run (G12)."
  - "The G12 discrepancy is answered with evidence: proposals run without isolation fails specs that depend on module state, so isolation stays until each such module resets its state, and the evidence names them."

## acceptance

- vitest runs with fsModuleCache and CI restores and saves its directory keyed on the lockfile and the vitest config; a second run of the same commit reports a lower transform time, recorded in the closing evidence (G86).
- A report script prints module evaluations per project from a vitest run (G12).
- The G12 discrepancy is answered with evidence: proposals run without isolation fails specs that depend on module state, so isolation stays until each such module resets its state, and the evidence names them.

## notes
- 2026-10-27, S1: `fsModuleCache` is on in the root vitest config, and each CI test zone restores `node_modules/.vitest-cache` after the install, keyed on `bun.lock` and the vitest configs, per zone, and saves it at the end. Locally, three projects (i18n, diagram, docs) took 46 s cold and 33 s warm on a loaded machine. The first CI run after merge seeds the cache; the closing evidence compares the second.
- S2: `tools/scripts/report/vitest-module-evaluations.script.ts` prints each project's evaluations from a run's output. Measured: proposals evaluated 1,631 modules 175,702 times (108 per module, 269 s importing) in an 839 s run. With `--no-isolate` the run took 359 s, but failed specs that depend on module state, and different ones in two runs: first 5 tests in 4 files, then `index-reader.spec.ts` (its fallback notice is logged once per process and the bookkeeping leaks between files) and `db-doctor.tool.spec.ts`. Isolation is not neutral for proposals, as G12 recorded; it stays. Relaxing it needs each of those modules to reset its state between files first, which is the follow-up.
