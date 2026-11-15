---
id: x01077
title: "A follower joins the proof that finished while it looked away"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-15
---

# x01077 — A follower joins the proof that finished while it looked away

## goal

A caller that follows another caller's proof of the same unit and tip returns that proof's result when the proof finishes between the follower's two reads, instead of proving the tip a second time.

## why

`follow` in the compute slot reads the result, then the claim. The claimant writes its result and `.done`, then removes its claim. A follower that read no result, then finds no claim, returned nothing: on the join-only path that became SUPERSEDED and the top level proved its own tip again ("prove this tip after all"), so a joined proof ran twice. The top-level path is already covered by the `finishedAt >= askedAt` read; the join path is not.

## non-goals

- The top-level `finishedAt >= askedAt` read stays as it is.
- No change to claim, `.done` or result file formats, nor to the poll interval.

## slices

- global_gate: none

### S1 — follow reads the result once more when its claim vanishes
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/src/lib/shared/compute-slot-follow.helper.ts`, `packages/core/tests/src/lib/shared/compute-slot-follow.helper.spec.ts`
- **Gate**: none

## acceptance

- When the claim followed is gone, `follow` reads the result once more and returns it when present.
- A spec plants the window (no result, then the result, then no claim) with injected ports, no timers, and asserts the finished result is returned without a pause and without a second turn.
- A claimant that died without a result still yields no result.
