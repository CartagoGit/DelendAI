---
id: x01072
title: "The load reference follows the benchmark CI measured"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-15
last-transition-id: 6cebe4b3-e03b-4c04-a35b-c11c1b1f6669
last-correlation-id: 6cebe4b3-e03b-4c04-a35b-c11c1b1f6669
last-transition-from: review
last-transition-at: 2026-11-18T04:22:03.783Z
shipped-in:
  - "398d9757c31d5e79447c5ecb483e9f4280c95cda"
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
- **Status**: done
- **Files**: `tools/scripts/test/test-load-reference.json`
- **Gate**: none
- acceptance:
  - "test-load-reference.json holds the median benchmark of develop's last CI runs (42.8 ms, run 43717290248)"
- shipped-in: `1574b6a7bcd4`
- review-state: done
- review-implementer: claude-haiku-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 398d9757c31d, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 1/1: (1) Read and parsed tools/scripts/test/test-load-reference.json; its only value is referenceMs 42.8, and the direct Bun assertion passes at exit 0. No later change… — Reviewed the delivered single-file change and current JSON. No later commit touched the file. A direct parse/assert check exits 0 and prints the committed reference as 42.8 ms, matching the proposal's CI benchmark without changing any test budget or calibration code.

## acceptance

- test-load-reference.json holds the median benchmark of develop's last CI runs (42.8 ms, run 43717290248)
