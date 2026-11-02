---
id: v00139
title: "The proposals specs reset their module state, so the project runs without per-file isolation"
kind: perf
status: in-progress
type: proposal
track: ci
date: 2026-10-27
last-transition-id: 1e3d4aaa-7749-415e-84e5-3b1dc3bd5e36
last-correlation-id: 1e3d4aaa-7749-415e-84e5-3b1dc3bd5e36
last-transition-from: review
last-transition-at: 2026-11-02T04:39:17.970Z
---

# v00139 — The proposals specs reset their module state, so the project runs without per-file isolation

## goal

The proposals vitest project runs with `isolate: false` and stays green in any file order, because every module that keeps state between calls resets it between spec files.

## why

Measured for v00138 on 2026-10-27: the proposals project evaluated its 1,631 modules 175,702 times (108 per module, 269 s importing) in an 839 s run. With `--no-isolate` the same run took 359 s, 2.3 times faster, but specs that depend on module state failed, and not the same ones twice: first five tests in four files, then `tests/src/lib/proposals/index-reader.spec.ts` (the fallback notice is logged once per process and its bookkeeping leaks from one file to the next) and `tests/src/lib/tools/db-doctor.tool.spec.ts`. Isolation is the only thing standing between those modules and the next file, at a cost of eight minutes per run.

## non-goals

- Dropping isolation in any other project.
- Removing or weakening a spec to make the order not matter.

## slices

- global_gate: type

### S1 — Each stateful module resets between files
- **Status**: review
- **Files**: `plugins/proposals/tests/setup/reset-module-state.setup.ts`, `plugins/proposals/vitest.config.ts`
- **Gate**: type
- acceptance:
  - "Every module whose state leaked in a no-isolation run is named in a setup file that resets it before each spec file, through the module's own reset (no spec reaches into another's internals)."
  - "Three no-isolation runs of the proposals project in different file orders (vitest --sequence.shuffle) pass."
- shipped-in: `02efbd523c6b`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — The project runs without per-file isolation
- **Status**: review
- **Files**: `plugins/proposals/vitest.config.ts`
- **Gate**: type
- acceptance:
  - "plugins/proposals/vitest.config.ts sets isolate: false; the module evaluations report (tools/scripts/report/vitest-module-evaluations.script.ts) shows the proposals count below a tenth of 175,702, and the run time is recorded before and after."
- shipped-in: `02efbd523c6b`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Every module whose state leaked in a no-isolation run is named in a setup file that resets it before each spec file, through the module's own reset (no spec reaches into another's internals).
- Three no-isolation runs of the proposals project in different file orders (vitest --sequence.shuffle) pass.
- plugins/proposals/vitest.config.ts sets isolate: false; the module evaluations report (tools/scripts/report/vitest-module-evaluations.script.ts) shows the proposals count below a tenth of 175,702, and the run time is recorded before and after.

## notes

Measured 2026-11-02 with `bunx vitest run --project proposals` (CLAUDECODE/AI_AGENT unset), 283 files, 2318 tests:

- Before (isolate on): 685 s.
- After (`isolate: false` plus `tests/setup/reset-module-state.setup.ts`): 484 s, a 29% saving, all green.
- Shuffled order (`--sequence.shuffle --sequence.seed=11`): 371 s, all green.

The whole project drops isolation; no spec is excluded. x00994 is left alone: it edits specs in cli, core and roadmap, a different change.
