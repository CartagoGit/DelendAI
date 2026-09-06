---
id: x00505
title: "Storm UNKNOWN_REFUSAL: 5× in 30s"
kind: fix
status: ready
type: proposal
track: general
date: 2026-09-06
priority: P1
created: 2026-09-06T23:27:20.333Z
author: x00419-auto-repair
storm:
  code: UNKNOWN_REFUSAL
  trigger: slice
  count: 5
  windowSeconds: 30
  firstSeenAt: 2026-09-06T02:20:18.689Z
  lastSeenAt: 2026-09-06T23:27:12.410Z
auto_generated: true
slices:
  - id: S1
    title: Fix UNKNOWN_REFUSAL (auto-generated repair proposal)
---

# x00505 — Storm UNKNOWN_REFUSAL: 5× in 30s

## Goal

Stop the engine from emitting `UNKNOWN_REFUSAL` repeatedly in the slice trigger.

## why

Storm detector observed `UNKNOWN_REFUSAL` 5 times in a 30s sliding window (firstSeenAt=2026-09-06T02:20:18.689Z, lastSeenAt=2026-09-06T23:27:12.410Z). The host boot hook (x00419 S5) filed this proposal so the cause is investigated, not just logged.

## non-goals

- Do not rename the refusal code; other tooling already depends on it.
- Do not touch the storm detector or the boot hook — only the producer.

## Slices

- global_gate: lint

### S1 — Investigate the fall-through path
- **Status**: pending
- **Files**:
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/tests/src/lib/engine.spec.ts`
  - `docs/delendai/proposals/ready/fixes/x00505-storm-unknown-refusal-5-in-30s.md`
- **Gate**: type
- acceptance:
  - "Root cause identified: `readSliceOwnership()` must preserve an empty positive-ownership result instead of degrading it to declared-only scope."
  - "A slice whose resolved ownership intersection is empty returns terminal `NO_CHANGE` and persists that outcome instead of falling through to `UNKNOWN_REFUSAL`."
  - "A focused engine regression test covers the zero-owned-files path and proves the outcome recorded in `processed-events.jsonl`."

## Root cause

The failing path lives in `plugins/commit-policy/src/lib/engine.ts`.

For slice events, the engine enriches the declared file list with positive
ownership from the agent-lock store before resolving the machine scope.
When `getPositiveOwnership()` returned an empty array, the old code treated
that as if ownership data were absent and fell back to declared-only scope.
That erased the distinction between:

1. "there is no ownership information"
2. "there is ownership information and this agent owns none of the declared paths"

Case (2) must be terminal `NO_CHANGE`: the slice has no machine-owned files to
commit. Preserving the empty ownership set keeps the resolved scope empty,
which lets the existing `NO_CHANGE` terminal path fire and persist the result
instead of bubbling into an unclassified refusal later in the pipeline.


## Sample proposal IDs implicated

- x00503
- p9995
- b00239
- r00043
