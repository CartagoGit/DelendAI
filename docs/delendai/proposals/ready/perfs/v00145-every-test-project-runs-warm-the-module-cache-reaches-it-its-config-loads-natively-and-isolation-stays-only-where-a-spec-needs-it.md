---
id: v00145
title: "Every test project runs warm: the module cache reaches it, its config loads natively, and isolation stays only where a spec needs it"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00145 — Every test project runs warm: the module cache reaches it, its config loads natively, and isolation stays only where a spec needs it

## goal

A test run spends its time running tests: modules are transformed once and kept, each project's config loads without being bundled first, and a project runs without per-file isolation unless one of its specs depends on it.

## why

The owner asked on 2026-10-29 whether TypeScript 7 or another runner would be faster. Measured that day: the typecheck already runs on TypeScript 7.0.2, the native compiler (19 s); a move to `bun test` was ruled out because the published comparisons agree it breaks `workspace:*` resolution and complex `vi.mock` use, both everywhere here. What is slow is Vitest's own setup, and three causes showed in the numbers:

- `fsModuleCache: true`, set at the root by v00138, reached no project: each project's config defines its own `test` block and inherits nothing from the root one. Vitest said so after every run ("transforming modules took 25.95s · 73% of tracked time, re-done on every run") and the CI cache step persisted a directory no project wrote.
- Every config imported `vitest.shared` without its extension (three also used `__dirname`), so Vite bundled each of the 80 configs before loading it instead of loading it natively.
- `vitest doctor` on orchestrator-runner: baseline (forks, isolate) 21.24 s, `pool: 'threads'` 17.83 s (−16%), `isolate: false` 13.00 s (−39%), with 4 workers 12.27 s (−42%); the suite passed twice in shuffled order without isolation. proposals measured 2.3 times faster without it (v00138), where module state leaked between files (v00139).

## non-goals

- Changing test runner.
- Dropping isolation for a project with a spec that needs it.

## slices

- global_gate: type

### S1 — The module cache and native config loading reach every project
- **Status**: pending
- **Files**: `vitest.shared.ts`, every `vitest.config.ts`
- **Gate**: type
- acceptance:
  - "Every project config spreads `sharedTestOptions` (`fsModuleCache: true`) and imports `vitest.shared.ts` with its extension, with no `__dirname`, so Vite loads it natively; orchestrator-runner's warm run took 18.4 s against 22.3 s cold."

### S2 — Isolation only where a spec needs it
- **Status**: pending
- **Files**: `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "Each project is run without isolation in shuffled order; the projects whose specs pass that way run with `isolate: false`, the others keep isolation and are named, with the failing spec, in `vitest.shared.ts`; the full suite's time before and after is recorded."

## acceptance

- Every project config spreads `sharedTestOptions` (`fsModuleCache: true`) and imports `vitest.shared.ts` with its extension, with no `__dirname`, so Vite loads it natively; orchestrator-runner's warm run took 18.4 s against 22.3 s cold.
- Each project is run without isolation in shuffled order; the projects whose specs pass that way run with `isolate: false`, the others keep isolation and are named, with the failing spec, in `vitest.shared.ts`; the full suite's time before and after is recorded.
