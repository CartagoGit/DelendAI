---
id: x01118
title: "Make the x01116 with-file-mutex waiter spec clock-independent"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-21
---

# x01118 — Make the x01116 with-file-mutex waiter spec clock-independent

## goal

The x01116 queued-waiters spec measures real wall time (holdMs 20 vs timeoutMs 40) and flakes under coverage and load. Drive the spec with fake timers so it no longer depends on machine speed while still failing on a single whole-queue deadline.

## why

One of five waiters times out legitimately when a holder's acquire+hold+release exceeds 40 ms on a slow runner; the product is correct, the spec is not deterministic.

## non-goals

- Changing with-file-mutex.ts
- Raising timeouts or adding retries

## slices

- global_gate: none

### S1 — Fake-timer x01116 spec
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/shared/with-file-mutex.spec.ts passes 20 times under coverage and load"
  - "the x01116 test fails when the deadline reset on token change is reverted"

## acceptance

- packages/core/tests/src/lib/shared/with-file-mutex.spec.ts passes 20 times under coverage and load
- the x01116 test fails when the deadline reset on token change is reverted
