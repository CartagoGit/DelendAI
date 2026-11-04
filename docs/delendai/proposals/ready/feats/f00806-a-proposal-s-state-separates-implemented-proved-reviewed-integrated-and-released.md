---
id: f00806
title: "A proposal's state separates implemented, proved, reviewed, integrated and released"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# f00806 — A proposal's state separates implemented, proved, reviewed, integrated and released

## goal

Each slice and proposal says which of implemented, proved, reviewed, integrated and released it has reached, so a slice awaiting review is not shown as pending.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 7. Claim: proposal state conflates stages, so a slice that is finished and only awaits review reads as pending. Verified in part: proposals carry a single `Status` per slice (`pending` in the slice block) plus separate `review-state`, `shipped-in` and `last-transition` fields, as in x00995 (S1 shows `Status: review`, `shipped-in`, `review-state: in_review`); the stages are therefore spread over unrelated fields and no one place states them. I did not audit every consumer of the status field.

## non-goals

- Removing the existing status values; the new stages are derived from facts already recorded.
- Changing the proposal state machine's transitions.

## slices

- global_gate: none

### S1 — The stage of a slice is derived from recorded facts
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/slice-stage.ts`
- **Gate**: type
- acceptance:
  - "A pure function maps a slice to implemented, proved, reviewed, integrated or released from its recorded facts (unit published, proof verdict, review verdict, merge, release); specs cover one slice per stage and a slice awaiting review."

### S2 — Boards and status show the stage
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/board.tool.ts`
- **Gate**: type
- acceptance:
  - "proposals board and proposals status show each slice's stage instead of pending when it only awaits review, and counts per stage."

## acceptance

- A pure function maps a slice to implemented, proved, reviewed, integrated or released from its recorded facts (unit published, proof verdict, review verdict, merge, release); specs cover one slice per stage and a slice awaiting review.
- proposals board and proposals status show each slice's stage instead of pending when it only awaits review, and counts per stage.
