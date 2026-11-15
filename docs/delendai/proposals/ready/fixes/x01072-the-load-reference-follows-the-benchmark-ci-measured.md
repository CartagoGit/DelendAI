---
id: x01072
title: "The load reference follows the benchmark CI measured"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-15
---

# x01072 — The load reference follows the benchmark CI measured

## goal

TODO: describe the goal.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — S1
- **Status**: pending
- **Files**: `tools/scripts/test/test-load-reference.json`
- **Gate**: none
- acceptance:
  - "test-load-reference.json holds the median benchmark of develop's last CI runs (42.8 ms, run 43717290248)"

## acceptance

- test-load-reference.json holds the median benchmark of develop's last CI runs (42.8 ms, run 43717290248)
