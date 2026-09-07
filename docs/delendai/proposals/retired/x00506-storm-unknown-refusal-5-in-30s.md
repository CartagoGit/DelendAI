---
id: x00506
title: "Storm UNKNOWN_REFUSAL: 5× in 30s"
kind: fix
status: retired
type: proposal
track: general
date: 2026-09-07
priority: P1
created: 2026-09-07T05:36:25.876Z
author: x00419-auto-repair
storm:
  code: UNKNOWN_REFUSAL
  trigger: slice
  count: 5
  windowSeconds: 30
  firstSeenAt: 2026-09-06T02:20:18.689Z
  lastSeenAt: 2026-09-07T05:36:23.645Z
auto_generated: true
slices:
  - id: S1
    title: Fix UNKNOWN_REFUSAL (auto-generated repair proposal)
last-transition-id: d7dae58c-72a9-409a-b029-524e4264a08e
last-correlation-id: d7dae58c-72a9-409a-b029-524e4264a08e
last-transition-from: ready
---

# x00506 — Storm UNKNOWN_REFUSAL: 5× in 30s

## Goal

Stop the engine from emitting `UNKNOWN_REFUSAL` repeatedly in the slice trigger.

## why

Storm detector observed `UNKNOWN_REFUSAL` 5 times in a 30s sliding window (firstSeenAt=2026-09-06T02:20:18.689Z, lastSeenAt=2026-09-07T05:36:23.645Z). The host boot hook (x00419 S5) filed this proposal so the cause is investigated, not just logged.

## non-goals

- Do not rename the refusal code; other tooling already depends on it.
- Do not touch the storm detector or the boot hook — only the producer.

## Slices

- global_gate: lint

### S1 — Investigate the fall-through path
- **Status**: pending
- **Files**: - TBD — producer did not supply a source-file hint
- **Gate**: type
- acceptance:
  - "Root cause of `UNKNOWN_REFUSAL` is identified and added to this proposal's ## Files"
  - "Acceptance criteria added once the file is known"


## Sample proposal IDs implicated

- x00503
- p9995
- b00239
- r00043
- c00160
