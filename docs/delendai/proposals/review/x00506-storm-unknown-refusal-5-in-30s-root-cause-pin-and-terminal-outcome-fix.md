---
id: x00506
title: "Storm UNKNOWN_REFUSAL: 5× in 30s — root-cause pin and terminal-outcome fix"
kind: fix
status: review
type: proposal
track: general
date: 2026-09-07
priority: P1
created: 2026-09-07T05:36:25.876Z
author: x00419-auto-repair
shipped-in:
  - <to-be-filled-by-commit-on-close>
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
last-transition-id: t-2026-09-07-x00506-to-review
last-correlation-id: c-2026-09-07-x00506-to-review
last-transition-from: in-progress
last-idempotency-key: idem-2026-09-07-x00506-to-review
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

### S1 — Investigate the fall-through path and stop the storm loop
- **Status**: done
- **Files**:
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/tests/src/lib/engine-terminal-refusals.spec.ts`
- **Gate**: type
- acceptance:
  - "Root cause identified and pinned to `refusalToEngine` in `plugins/commit-policy/src/lib/engine.ts` (the catch-all branch returns `err('UNKNOWN_REFUSAL', refusal, metadata)` for any driver refusal string not matched by the typed patterns)."
  - "`UNKNOWN_REFUSAL` is declared terminal in `TERMINAL_REFUSAL_OUTCOMES` (maps to `PERMANENT_REFUSAL`); the slice listener therefore stops re-emitting it and the storm detector sees no new timestamps for that event id."
  - "Test pin in `engine-terminal-refusals.spec.ts` proves `terminal(refusal) === true` for an unclassified driver refusal string that maps to `UNKNOWN_REFUSAL`."
  - "Manual / interval / threshold trigger semantics are unchanged (the new terminal mapping is consumed only inside `handleEvent`, and only `PERMANENT_REFUSAL` is recorded)."
- review-state: done
- review-implementer: Cartago
- review-reviewer: delendai-review-x00506-s1-20260907
- review-log: approved by delendai-review-x00506-s1-20260907 — Independent verification: `refusalToEngine` catch-all at engine.ts:1225, terminal-outcome map entry added, `engine-terminal-refusals.spec.ts` carries a UNKNOWN_REFUSAL pin. Focused spec runs green.

## acceptance

- Root cause of `UNKNOWN_REFUSAL` is identified and added to this proposal's `## Files`.
- The acceptance criteria are updated once the producer pinpoints the source file.

## notes

- x00503
- p9995
- b00239
- r00043
- c00160
