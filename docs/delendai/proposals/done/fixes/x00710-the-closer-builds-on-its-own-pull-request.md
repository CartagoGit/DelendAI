---
id: x00710
title: "The closer builds on its own pull request"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00700, x00706, x00708]
last-transition-id: 2a3949d9-da92-4428-852a-3278990326d1
last-correlation-id: 2a3949d9-da92-4428-852a-3278990326d1
last-transition-from: in-progress
---

# x00710 — The closer builds on its own pull request

## goal

The owner machine's closer adds to and refreshes its one open pull
request, and every pass leaves nothing behind.

## why

On 2026-09-27 the closer published #567 (29 closes), which went red on a
proposal text that #568 then fixed. It never recovered:

- The queue's refresh treats a red pull request as "its author pushes
  next". The author is the closer, which never touched a pull request it
  had opened.
- Each pass entered a fresh unit from develop and closed the same 28
  proposals again. The publisher then joined the open batch pull request
  (x00708), but the unit did not contain it, the push was not a
  fast-forward, and the pass failed.
- A failed pass left its worktree and branch behind: one per pass.

## why this design

- **Build on the open pull request.** Its publication is merged into the
  unit first. The push is a fast-forward, and the merge brings the pull
  request level with the integration branch, which is the refresh a red
  one needs. A merge that conflicts is left to a person.
- **Close only what is still in review in that tree**, and publish when
  there is a new close or the refresh moved the unit.
- **The unit ends with the pass**, whatever happened: a `finally` sweeps
  every unit the closer entered, including earlier passes' leftovers.

## non-goals

- Changing the queue's rule for red pull requests of other authors.

## architecture

- `tools/scripts/proposals/close-approved-proposals.script.ts`:
  `ownPublications`, `sweepOwnUnits`, the apply flow.

## Slices

- global_gate: none

### S1 — One pull request, kept moving

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/proposals/close-approved-proposals.script.spec.ts`
- **Files**:
  - `tools/scripts/proposals/close-approved-proposals.script.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.spec.ts`

## dependency graph

None.

## acceptance

- `ownPublications` finds the closer's publications under either spelling
  of the prefix and ignores its work refs and other agents'.
- After it merges, the next hydration brings #567 level with develop and
  it goes green. No `delendai-queue-close-approved-*` worktree survives a
  pass.
