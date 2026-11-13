---
id: v00139
title: "The proposals specs reset their module state, so the project runs without per-file isolation"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-27
last-transition-id: f4379616-0be8-48ef-ac7b-b95b3f57ab4c
last-correlation-id: f4379616-0be8-48ef-ac7b-b95b3f57ab4c
last-transition-from: review
last-transition-at: 2026-11-02T20:15:24.467Z
shipped-in:
  - "467ac87e92c2a97d92c2863ded2d804ef141337f"
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
- **Status**: pending
- **Files**: `plugins/proposals/tests/setup/reset-module-state.setup.ts`, `plugins/proposals/vitest.config.ts`
- **Gate**: type
- acceptance:
  - "Every module whose state leaked in a no-isolation run is named in a setup file that resets it before each spec file, through the module's own reset (no spec reaches into another's internals)."
  - "Three no-isolation runs of the proposals project in different file orders (vitest --sequence.shuffle) pass."
- shipped-in: `02efbd523c6b`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S1, the reset that makes the shared worker safe.

WHAT IS WRONG. The setup file plugins/proposals/tests/setup/reset-module-state.setup.ts names five modules to reset before each spec file: the index reader's fallback notice, the index read stats, the stale projection checks, the plan closure bypass log and the peer review bypass log. The agent lock session store is not among them, and its module state leaks between spec files now that the project runs with isolate false. That leak is observable: the cached session balance path set by an earlier file is still set when a later file calls resetAgentLockSessionBalance, and resetSessionBalance in plugins/proposals/src/lib/locks/agent-lock-session-store.ts:198 creates the directory of the stale path before it clears it. When the earlier file used a workspace root of /ws, the reset tries to create /ws and fails.

WHERE. plugins/proposals/tests/setup/reset-module-state.setup.ts, which does not name the agent lock session store or the session balance; plugins/proposals/src/lib/locks/agent-lock-session-store.ts:198 to 204, where resetSessionBalance awaits mkdir of dirname(cachedPath) before setting cachedPath to null; and the two specs that call resetAgentLockSessionBalance without awaiting it, plugins/proposals/tests/src/lib/state-tools.spec.ts:43 and plugins/proposals/tests/src/lib/agent-lock-ok-contract.spec.ts:26.

HOW TO REPRODUCE. From the repository root run bunx vitest run --project proposals --sequence.shuffle --sequence.seed=4242 --bail 0 --reporter=default. All 285 files and all 2325 tests pass, but the run exits 1: Vitest reports two unhandled rejections, both EACCES: permission denied, mkdir '/ws', raised from resetSessionBalance through resetAgentLockSessionBalance, and it attributes them to state-tools.spec.ts and agent-lock-ok-contract.spec.ts. The order decides whether the two files meet, which is exactly what the criterion asks to be true of every order. Running the same two files alone passes, so the failure needs the file that seeds the root to run first.

WHAT MUST HOLD. A no isolation run of the proposals project exits 0 in every file order, with no unhandled rejection left behind. Two ways reach it: the setup file resets the agent lock session store through its own exported reset before each spec file, and that reset clears the cached path before it touches the filesystem, or the specs await the reset they call. The first criterion asks for every module whose state leaked to be named in the setup file, and this module's state leaked.

Slice S2 is judged separately: its isolate false setting and its recorded run time hold, and the module evaluations clause is named in its own note.

### S2 — The project runs without per-file isolation
- **Status**: done
- **Files**: `plugins/proposals/vitest.config.ts`
- **Gate**: type
- acceptance:
  - "plugins/proposals/vitest.config.ts sets isolate: false; the module evaluations report (tools/scripts/report/vitest-module-evaluations.script.ts) shows the proposals count below a tenth of 175,702, and the run time is recorded before and after."
- shipped-in: `02efbd523c6b`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 467ac87e92c2, validate exit 0 and tests 285/285 claimed, no recorded run cited; acceptance 1/1: (1) At 467ac87e92c2a97d92c2863ded2d804ef141337f plugins/proposals/vitest.config.ts sets isolate false, and it is the only project in the repository that does, so n… — Approved on the delivered state of 467ac87e92c2a97d92c2863ded2d804ef141337f. The proposals project runs without per-file isolation and the run time is recorded before and after, 685 s against 484 s. One clause of the criterion cannot hold as written and is named here so the proposal text can be amended rather than the slice blocked forever: the module evaluations report reads the line Vitest prints only when isolation is on, so a run without isolation prints no evaluations line at all and the report has nothing to read. The delivery's own notes say the same. The count below a tenth of 175,702 was therefore never measured; what was measured is the wall clock, which fell by 29 percent. The type gate exited 0 and the project passed 285 of the 285 files in a shuffled run. The run still exits 1 because of the unhandled rejections that slice S1 is sent back for, which is a defect of the reset and not of this slice.

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

- 2026-11-02: `sequence.groupOrder` on the project: without isolation its workers differ from the others, and a zone running several projects together failed before any test ran (#1645, `tests: readers`). A third shuffled run, seed 333, passed in 324 s. The module-evaluations report has its isolated baseline, 183,494 evaluations; a run without isolation prints no evaluations line, so that report cannot compare the two.
