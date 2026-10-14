---
id: x00509
title: "Storm UNKNOWN_REFUSAL: 5× in 30s"
kind: fix
status: retired
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
superseded-by: x00505
slices:
  - id: S1
    title: Fix UNKNOWN_REFUSAL (auto-generated repair proposal)
---

# x00509 — Storm UNKNOWN_REFUSAL: 5× in 30s

> **SUPERSEDED por `x00505`.**
> Esta copia duplicada se retira porque la propuesta ya quedó implementada y
> archivada correctamente bajo `done/fixes/x00505-...md`.

## goal

Stop the engine from emitting `UNKNOWN_REFUSAL` repeatedly in the slice trigger.

## why

Storm detector observed `UNKNOWN_REFUSAL` 5 times in a 30s sliding window (firstSeenAt=2026-09-06T02:20:18.689Z, lastSeenAt=2026-09-06T23:27:12.410Z). The host boot hook filed a duplicate proposal while the already-completed copy still existed on disk.

## non-goals

- Do not reopen the underlying engine fix.
- Do not create a second active proposal for the same resolved incident.

## slices

### S1 — Retire the duplicate document

- **Status**: done
- **Files**: `docs/delendai/proposals/retired/x00509-storm-unknown-refusal-5-in-30s.md`
- **Gate**: lint
- acceptance:
  - "The duplicate leaves the ready queue."
  - "The canonical implemented proposal remains `x00505`."

## acceptance

- The duplicate leaves the ready queue.
- The canonical implemented proposal remains `x00505`.

## notes

- Superseded by the already-completed `x00505` fix.