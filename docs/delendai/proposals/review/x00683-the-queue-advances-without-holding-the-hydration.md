---
id: x00683
title: "The queue advances without holding the hydration"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00680]
last-transition-id: 4dd0c38e-fc57-4711-98c8-2a99a5d8b6b6
last-correlation-id: 4dd0c38e-fc57-4711-98c8-2a99a5d8b6b6
last-transition-from: in-progress
---

# x00683 — The queue advances without holding the hydration

## goal

The step that dispatches the merge queue after a certification never
makes the hydrator wait. Candidates keep being brought forward while the
integration branch's certification runs.

## why

x00680 made the hydrator's last step wait up to 50 minutes for the
certification of the integration tip, then dispatch the queue. The
hydrator runs its steps inside one exclusive lock, and a second pass
steps aside while the lock is held. So after every merge, for as long as
the certification took (about 15 minutes; up to 50), no candidate was
brought forward. The host server already runs the hydrator every 10
minutes and whenever the integration branch moves, so there is no need
to wait inside a pass.

## why this design

- **Each pass reads once.** Once the tip's certification has finished
  (certified, or red for the queue's repair path), the pass dispatches
  the queue. While it is still running, the pass leaves it to the next
  one. The dispatch comes at most one refresh interval after the
  certification ends.
- **Once per tip.** The tip dispatched for is recorded in
  `.cache/delendai/results/queue-advanced-for.txt`, so the clock does not
  dispatch the same tip every 10 minutes.

## non-goals

- Changing the refresh interval.

## architecture

- `tools/scripts/forge/advance-queue.script.ts`: `nextStep` reads the
  certification and the recorded tip; nothing waits.
- `tools/scripts/git/hydrate-candidates-after-merge.script.ts`: the step's
  timeout drops from 50 minutes to 60 seconds.

## Slices

- global_gate: none

### S1 — One read per pass, one dispatch per tip

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/forge/advance-queue.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/advance-queue.script.ts`
  - `tools/scripts/forge/advance-queue.script.spec.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A pass whose tip is still being certified returns at once without
  dispatching.
- A certified or red tip is dispatched for once; later passes on the
  same tip do nothing.
