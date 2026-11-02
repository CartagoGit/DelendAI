---
id: x01002
title: "A stranded proposal is told to hand over, not to close by hand"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# x01002 — A stranded proposal is told to hand over, not to close by hand

## goal

When every slice of a proposal in ready/ or in-progress/ is marked done, proposal-ready-to-close tells the agent the step that is legal there: set the slices back to pending and run work deliver, which moves them to review with their shipped-in. It no longer advises adding shipped-in by hand or a transition to done that the state machine refuses.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The stranded advice names the hand-over
- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-ready-to-close.script.ts`, `tools/scripts/lint/proposal-ready-to-close.script.spec.ts`
- **Gate**: none
- acceptance:
  - "A finding in ready/ or in-progress/ names work deliver and setting the slices back to pending, and names no transition to done; a spec checks it."
  - "A finding in review/ keeps its review-then-done advice."

## acceptance

- A finding in ready/ or in-progress/ names work deliver and setting the slices back to pending, and names no transition to done; a spec checks it.
- A finding in review/ keeps its review-then-done advice.
