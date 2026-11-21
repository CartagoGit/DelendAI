---
id: x01116
title: "A lock wait budget counts time without progress, not queue length"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: 61367beb-bfa7-4b2d-9665-4b9deda6d82a
last-correlation-id: 61367beb-bfa7-4b2d-9665-4b9deda6d82a
last-transition-from: ready
last-transition-at: 2026-11-21T05:46:04.560Z
---

# x01116 — A lock wait budget counts time without progress, not queue length

## goal

Targets @delendai/core 0.3.0. withFileMutex fails a waiter only when ONE live holder keeps the lock past timeoutMs; a queue of short holders ahead never exhausts the budget, so concurrent-writer specs and tools no longer fail under coverage or load.

## why

x01109 failed four coverage prechecks, each on a different concurrent-writer spec (queue-races barrier, memory store-concurrency, coordination-chaos, sync-proposal-registry-race, proposal-create.concurrency 'mutex held past 5000ms'). Measured: queue-races under --coverage failed on its first (cold-transform) run and passed on four warm reruns. Shared mechanism: withFileMutex sets deadline = start + timeoutMs (5000) ONCE; N waiters serialize, so the Nth waiter's wait is the sum of N holders' critical sections, which coverage instrumentation multiplies. The Nth waiter throws LockContentionError although every holder is healthy and progressing. agent-names emitQueueEvent catches and discards it ('Queue is optional coordination'), so the barrier test sees a silently lost entry. Selection: 1264 of 1310 specs with recorded reads in zone-reads.generated.json read delendai.config.json (the generic config loader at boot), so readerSpecs() selects them all; runsEverything() also keeps the zone-level answer at 'all'. The selection follows the recorded map correctly but the map cannot tell a meaningful read from the loader's.

## non-goals

- Raising timeoutMs defaults or adding retries
- Changing the staleness/liveness reclaim rules
- Changing the lease file format

## slices

- global_gate: none

### S1 — The wait deadline restarts when the lock changes holder
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "with-file-mutex.spec.ts: N waiters queued behind short holders whose summed hold time exceeds timeoutMs all acquire, none throws LockContentionError; on the old code the same spec fails."
  - "with-file-mutex.spec.ts: one live holder that keeps the lock past timeoutMs still makes a waiter throw LockContentionError."
  - "with-file-mutex.race.spec.ts and with-file-mutex.liveness.spec.ts still pass."

### S2 — A lost watchdog enqueue is reported, not swallowed
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/agent-names.tool.ts`, `plugins/proposals/tests/src/lib/tools/queue-races.e2e.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "queue-races.e2e.spec.ts: when the queue mutex cannot be taken the reconcile result names the entries not enqueued instead of dropping them silently."
  - "queue-races.e2e.spec.ts barrier test keeps passing under --coverage."

### S3 — A spec read of delendai.config.json through the generic loader does not select the spec
- **Status**: pending
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/near-specs.ts`, `tools/scripts/ci/near-specs.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "near-specs.spec.ts: a change to delendai.config.json selects the specs whose reads name a config key the change touched, not every spec that loaded it."
  - "near-specs.spec.ts: a change to a root config no spec reads selects no reader."

## acceptance

- with-file-mutex.spec.ts: N waiters queued behind short holders whose summed hold time exceeds timeoutMs all acquire, none throws LockContentionError; on the old code the same spec fails.
- with-file-mutex.spec.ts: one live holder that keeps the lock past timeoutMs still makes a waiter throw LockContentionError.
- with-file-mutex.race.spec.ts and with-file-mutex.liveness.spec.ts still pass.
- queue-races.e2e.spec.ts: when the queue mutex cannot be taken the reconcile result names the entries not enqueued instead of dropping them silently.
- queue-races.e2e.spec.ts barrier test keeps passing under --coverage.
- near-specs.spec.ts: a change to delendai.config.json selects the specs whose reads name a config key the change touched, not every spec that loaded it.
- near-specs.spec.ts: a change to a root config no spec reads selects no reader.
