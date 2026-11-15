---
id: x01072
title: "The load reference follows the benchmark CI measured"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: 91ebf436-16ec-4398-8191-d72c90f31c27
last-correlation-id: 91ebf436-16ec-4398-8191-d72c90f31c27
last-transition-from: in-progress
last-transition-at: 2026-11-15T17:24:54.654Z
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
- **Status**: review
- **Files**: `tools/scripts/test/test-load-reference.json`
- **Gate**: none
- acceptance:
  - "test-load-reference.json holds the median benchmark of develop's last CI runs (42.8 ms, run 43717290248)"
- shipped-in: `1574b6a7bcd4`
- review-state: in_review
- review-implementer: claude-haiku-5-5

## acceptance

- test-load-reference.json holds the median benchmark of develop's last CI runs (42.8 ms, run 43717290248)
