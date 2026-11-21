---
id: x01126
title: "A lock wait budget and a zombie release are not decided by a wall-clock step"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-21
---

# x01126 — A lock wait budget and a zombie release are not decided by a wall-clock step

## goal

Targets @delendai/core 0.3.0. withFileMutex and the work-ref hold/enter waits measure their deadline with Date.now(), so a wall-clock step (measured on WSL2: Date.now advanced about 5.6 s while performance.now moved 50-340 ms) throws LockContentionError 'held past 5000ms' with no real wait. gcZombies then drops a failed agent_lock release silently, so no zombie-gc-event is queued (the flaky queue-races sweep test). Deadlines run on a monotonic clock, and a release that could not be made is reported as notReleased beside notEnqueued.

## why

queue-races 'expire sweep racing concurrent enqueues clobbers nothing' failed about 1 run in 5 when the tools and agents folders ran together. The mutex contention was spurious (monotonic wait about 300 ms) and gcZombies skipped the watchdog event because releasedLock stayed false. A clock step must never turn into a lock failure, and a failed release must never be silent. Distinct from x01118, which only makes a with-file-mutex spec clock-independent and leaves the product unchanged.

## non-goals

- Raising any timeout or adding retries
- Changing the mutex ownership, lease or heartbeat protocol
- Changing the x01118 spec work

## slices

- global_gate: none

### S1 — Lock and hold waits run on a monotonic clock
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `new:packages/core/tests/src/lib/shared/with-file-mutex-monotonic-deadline.spec.ts`, `new:packages/core/tests/src/lib/work-units/work-wait-monotonic-deadline.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/shared/with-file-mutex-monotonic-deadline.spec.ts steps Date.now() by about 5.6 s while performance.now() barely moves and the waiter still acquires instead of throwing LockContentionError [<200ms]"
  - "packages/core/tests/src/lib/shared/with-file-mutex-monotonic-deadline.spec.ts still throws LockContentionError when performance.now() passes timeoutMs while Date.now() stands still, with a fake clock and no real timers [<200ms]"
  - "packages/core/tests/src/lib/work-units/work-wait-monotonic-deadline.spec.ts shows the work-ref hold wait and the enter wait ignore the same Date.now() step with a fake clock and no real timers [<200ms]"

### S2 — gcZombies reports a release it could not make
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/agents/zombie-reconcile.ts`, `plugins/proposals/src/lib/tools/agent-names.tool.ts`, `new:plugins/proposals/tests/src/lib/agents/zombie-reconcile.not-released.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "plugins/proposals/tests/src/lib/agents/zombie-reconcile.not-released.spec.ts injects an agent_lock release that fails with LockContentionError and expects the reconcile result to list the task under notReleased, not silently omit it [<200ms]"
  - "plugins/proposals/tests/src/lib/agents/zombie-reconcile.not-released.spec.ts expects a release that succeeds to leave notReleased empty and queue its zombie-gc-event, with a fake clock stepping Date.now() by about 5.6 s and no real timers [<200ms]"

## acceptance

- packages/core/tests/src/lib/shared/with-file-mutex-monotonic-deadline.spec.ts steps Date.now() by about 5.6 s while performance.now() barely moves and the waiter still acquires instead of throwing LockContentionError [<200ms]
- packages/core/tests/src/lib/shared/with-file-mutex-monotonic-deadline.spec.ts still throws LockContentionError when performance.now() passes timeoutMs while Date.now() stands still, with a fake clock and no real timers [<200ms]
- packages/core/tests/src/lib/work-units/work-wait-monotonic-deadline.spec.ts shows the work-ref hold wait and the enter wait ignore the same Date.now() step with a fake clock and no real timers [<200ms]
- plugins/proposals/tests/src/lib/agents/zombie-reconcile.not-released.spec.ts injects an agent_lock release that fails with LockContentionError and expects the reconcile result to list the task under notReleased, not silently omit it [<200ms]
- plugins/proposals/tests/src/lib/agents/zombie-reconcile.not-released.spec.ts expects a release that succeeds to leave notReleased empty and queue its zombie-gc-event, with a fake clock stepping Date.now() by about 5.6 s and no real timers [<200ms]
