---
id: x01055
title: "File-granularity lock spec raced the mutex order and measured wall-clock time"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-08
last-transition-id: 1525b931-6895-49da-b368-77bec26e47b1
last-correlation-id: 1525b931-6895-49da-b368-77bec26e47b1
last-transition-from: in-progress
last-transition-at: 2026-11-10T02:25:25.403Z
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
- **Status**: review
- **Files**: `plugins/proposals/tests/src/lib/locks/agent-lock-engine-file-granularity.spec.ts`, `tools/scripts/lint/no-sleep-in-specs.baseline.json`
- **Gate**: none
- shipped-in: `4455447e2521`
- review-state: in_review
- review-implementer: claude-sonnet-5-5
- review-log: requested_changes by claude-opus-5-5 — Acceptance lines hold (no sleep, no wall-clock assertion, out of the no-sleep baseline; spec passes 3/3), but the contention test no longer proves what its title claims. plugins/proposals/tests/src/lib/locks/agent-lock-engine-file-granularity.spec.ts:180 asserts expect(settled).toBe(false) synchronously right after runAgentLockEngine() is called: a .finally() callback can never run before the next microtask, so the assertion is true whether or not the second claim waits for the held mutex. The old elapsed>=100 check was the only proof of waiting and it was removed without a replacement, so 'the second waits for the critical section' (line 123) is now unverified. To approve: before line 180 yield deterministically to the engine (e.g. await a signal that the second claim has attempted the mutex: spy/poll hook, or await a few setImmediate turns with mutexPollMs observed) so that settled===false is meaningful, then release; keep no wall-clock assertion.

## acceptance

- The spec has no wall-clock assertion and no sleep, and passes under load.
- The spec is out of the no-sleep-in-specs baseline.
