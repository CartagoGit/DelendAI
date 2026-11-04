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

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

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
