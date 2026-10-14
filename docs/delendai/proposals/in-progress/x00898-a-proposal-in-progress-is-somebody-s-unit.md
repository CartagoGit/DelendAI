---
id: x00898
title: "a proposal in progress is somebody's unit"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-14
---

# x00898 — a proposal in progress is somebody's unit

## goal

The workflow invariants report a proposal that sits in `in-progress/` on the integration branch with no unit anywhere: no work branch and no publication, here or on the forge. Removing a unit leaves a record of who removed it and why.

## why

In progress is the one state that keeps a work branch (x00892). Two proposals broke that on 2026-10-14 and nothing said so:

1. **x00893** shipped all four slices in #1070, published while it was still in progress, and its unit was later reaped as delivered. The proposal stayed in `in-progress/` with no branch, worktree or pull request, and read as work under way until it was noticed by hand and handed to review (#1077).
2. **f00762** published S1 and S2 as #1080 with S3 still pending. Its work branch was gone, here and on the forge, by the time #1080 had merged. `work publish` keeps the branch of a proposal in progress, and the reaper judges such a unit `idle`, so something else removed it. The work event journal holds no entry for the removal, and the publication log none either, so who did it could not be told. The remover was found later the same day in the queue job's log: `ref-lifecycle --reap` deleted the work branch on the forge once its content was in its publication (x00899).

## non-goals

- Restoring a removed branch: what landed is on the integration branch, and the unit is entered again from there.

## slices

- global_gate: type

### S1 — The invariants name a proposal in progress that no unit holds

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/work-units/in-progress-units.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/in-progress-units.service.spec.ts`
- **Gate**: type
- acceptance:
  - `in-progress-has-units` holds when every proposal under `in-progress/` on the integration branch has a work or publication branch, on the forge or in a local worktree, and otherwise names the ones that do not, with the remedy: enter the proposal again, or move it to review, ready, blocked or paused.
  - Run against this clone when it was written, it named f00762.

### S2 — Removing a unit says who removed it and why

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/unit-removal.service.ts`
  - `packages/core/src/lib/work-units/work-event-journal.service.ts`
- **Gate**: type
- acceptance:
  - Every removal of a unit's worktree or branch, local or on the forge, writes a journal entry naming the unit, the command or hook that removed it, and the reason it gave, readable without the payload hash.
  - The f00762 case is reproduced: the remover is identified, and a unit whose proposal is in progress is not removed by it.

## acceptance

- A proposal in progress with no unit is reported by the doctor, and the next removal of a unit can be traced to its cause.
