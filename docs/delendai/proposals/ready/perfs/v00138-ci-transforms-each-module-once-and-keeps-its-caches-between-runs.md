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
- **Files**: `vitest.shared.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "vitest runs with fsModuleCache and CI restores and saves its directory keyed on the lockfile and the vitest config; a second run of the same commit reports a lower transform time, recorded in the closing evidence (G86)."

### S2 — proposals evaluates each module once where state allows
- **Status**: pending
- **Files**: `plugins/proposals/vitest.config.ts`, `tools/scripts/report/vitest-module-evaluations.script.ts`
- **Gate**: type
- acceptance:
  - "A report script prints module evaluations per project from a vitest run; the proposals count drops measurably from 151,382 (G12)."
  - "Any spec group run without isolation has a spec proving the module state it touches is reset between files; the G12 discrepancy is answered with that evidence."

## acceptance

- vitest runs with fsModuleCache and CI restores and saves its directory keyed on the lockfile and the vitest config; a second run of the same commit reports a lower transform time, recorded in the closing evidence (G86).
- A report script prints module evaluations per project from a vitest run; the proposals count drops measurably from 151,382 (G12).
- Any spec group run without isolation has a spec proving the module state it touches is reset between files; the G12 discrepancy is answered with that evidence.
