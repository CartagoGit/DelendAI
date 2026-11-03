---
id: x01017
title: "Shipped slices of q00038 and r00644 say so"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# x01017 — Shipped slices of q00038 and r00644 say so

## goal

The slices of q00038 and r00644 that already landed are recorded as done with the commit that shipped them, so proposal-already-implemented passes on develop and every proof can pass again.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Record what shipped
- **Status**: pending
- **Files**: `docs/delendai/proposals/in-progress/q00038-plan-every-check-runs-only-for-what-the-change-can-affect.md`, `docs/delendai/proposals/ready/refactors/r00644-the-proposals-plugin-is-split-along-its-engines-and-each-engine-is-covered.md`
- **Gate**: none
- acceptance:
  - "q00038 S1, S4, S5, S6 and S7 and r00644 S5 are done with their shipping commits, and lint:job:governance passes on develop."

## acceptance

- q00038 S1, S4, S5, S6 and S7 and r00644 S5 are done with their shipping commits, and lint:job:governance passes on develop.
