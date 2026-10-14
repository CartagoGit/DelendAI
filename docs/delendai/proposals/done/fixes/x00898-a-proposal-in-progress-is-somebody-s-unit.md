---
id: x00898
title: "a proposal in progress is somebody's unit"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-14
last-transition-id: 87046962-5209-4837-880e-bd100c9eb8b3
last-correlation-id: 87046962-5209-4837-880e-bd100c9eb8b3
last-transition-from: review
last-transition-at: 2026-10-14T11:57:40.405Z
shipped-in:
  - "7ea620857"
---

# x00898 — a proposal in progress is somebody's unit

## goal

The workflow invariants report a proposal that sits in `in-progress/` on the integration branch with no unit anywhere: no work branch and no publication, here or on the forge.

## why

In progress is the one state that keeps a work branch (x00892). Two proposals broke that on 2026-10-14 and nothing said so:

1. **x00893** shipped all four slices in #1070, published while it was still in progress, and its unit was later reaped as delivered. The proposal stayed in `in-progress/` with no branch, worktree or pull request, and read as work under way until it was noticed by hand and handed to review (#1077).
2. **f00762** published S1 and S2 as #1080 with S3 still pending. Its work branch was gone, here and on the forge, by the time #1080 had merged. `work publish` keeps the branch of a proposal in progress, and the reaper judges such a unit `idle`, so something else removed it. The work event journal holds no entry for the removal, and the publication log none either, so who did it could not be told. The remover was found later the same day in the queue job's log: `ref-lifecycle --reap` deleted the work branch on the forge once its content was in its publication (x00899).

## non-goals

- Journalling every unit removal, the second slice this proposal first had: the removals that motivated it were the queue job's, whose log names each one, and x00899 stopped them.

- Restoring a removed branch: what landed is on the integration branch, and the unit is entered again from there.

## slices

- global_gate: type

### S1 — The invariants name a proposal in progress that no unit holds

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/in-progress-units.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/in-progress-units.service.spec.ts`
- **Gate**: type
- acceptance:
  - `in-progress-has-units` holds when every proposal under `in-progress/` on the integration branch has a work or publication branch, on the forge or in a local worktree, and otherwise names the ones that do not, with the remedy: enter the proposal again, or move it to review, ready, blocked or paused.
  - Run against this clone when it was written, it named f00762.
- shipped-in: `7ea6208571ae`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 7ea620857, validate exit 0, tests 3/3 — Delivered by 9e50fc9f8 and merged as 7ea620857 (PR #1082), which carries all four declared files. Gate `type`. The criterion has two halves and I treated them differently, because they are not the same kind of claim. ACC0 is a contract about behaviour, so I ran it: the check is implemented at packages/core/src/lib/work-units/in-progress-units.service.ts:44 (`id: 'in-progress-has-units'`), builds `held` from every work unit's proposal, subtracts it from the in-progress set, sorts what is left into `stranded`, and on a non-empty remainder reports `${stranded.length} with no unit: ${stranded.slice(0, 5).join(', ')}` together with the remedy 'enter it again to go on (`delendai work enter --proposal=<id>`), or move it to where it stands: review, ready, blocked or paused' — naming and remedy both, exactly as required. Then I ran `bun run cli work doctor` in this checkout and it produced precisely that shape: '✗ in-progress-has-units … BROKEN — 3 with no unit: c00530, f00500, x00892' followed by the same remedy line. So the check finds and names real strays in this very repository. Spec: in-progress-units.service.spec.ts → 3 pass / 0 fail (the 3/3 above). ACC1 I do not claim as reproducible, and the reason is worth stating rather than glossing: it records that the check "named f00762" when it was written. f00762 is not in today's stranded list, and the reason is benign — it has since acquired its own unit and is being worked, so the condition the criterion observed has been legitimately resolved. A criterion that names a historical observation is not falsified by the observation ceasing to be true; what ACC1 really asserts is that the check fires against a real clone, and ACC0's live doctor run demonstrates precisely that. If the owner reads ACC1 as a standing claim that f00762 must be flagged, that is a different (and, in my reading, incorrect) expectation.

## acceptance

- A proposal in progress with no unit is reported by the doctor.
