---
id: x01072
title: "The load reference follows the benchmark CI measured"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-15
last-transition-id: 1c17b6ba-50eb-4d16-b6db-7b528f3a055d
last-correlation-id: 1c17b6ba-50eb-4d16-b6db-7b528f3a055d
last-transition-from: ready
last-transition-at: 2026-11-15T17:22:09.690Z
---

# x01072 — The load reference follows the benchmark CI measured

## goal

tools/scripts/test/test-load-reference.json holds the benchmark CI measures today, so the load factor of a shard reflects its real load.

## why

The committed 44.7 ms reference is older than the runners' current 42.8 ms median; the load factor came out too low and an untouched e2e test (forge-event-store, 216.8 ms against 200 ms at factor 1.067) failed PR #2154.

## non-goals

- No test budget is raised and no test is changed; the calibration workflow itself is not changed.

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
