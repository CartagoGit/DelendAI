---
id: x01016
title: "The fast proof scales with the change it proves"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# x01016 — The fast proof scales with the change it proves

## goal

prove --fast ran every repo-wide gate for any change (936 s for a 3-file fix, ~15 min for a Markdown proposal). Measure each step, run each only where the change can affect it, and print and save a step-timing table.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Scope and time the fast proof
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
