---
id: x01055
title: "File-granularity lock spec raced the mutex order and measured wall-clock time"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 391774d2-258a-4b9c-897c-c8738812f7d7
last-correlation-id: 391774d2-258a-4b9c-897c-c8738812f7d7
last-transition-from: ready
last-transition-at: 2026-11-08T21:24:24.723Z
---

# x01055 — File-granularity lock spec raced the mutex order and measured wall-clock time

## goal

The spec asserted elapsed wall-clock bounds and assumed the holder won the mutex before the second claim; under load both break. Make it order- and load-independent.

## why

An intermittent failure is a defect. The spec measured wall-clock time and assumed the mutex holder won the race, so it failed under load.

## non-goals

- Changing the lock engine: it behaved correctly.

## slices

- global_gate: none

### S1 — Make the file-granularity lock spec deterministic
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/locks/agent-lock-engine-file-granularity.spec.ts`, `tools/scripts/lint/no-sleep-in-specs.baseline.json`
- **Gate**: none

## acceptance

- The spec has no wall-clock assertion and no sleep, and passes under load.
- The spec is out of the no-sleep-in-specs baseline.
