---
id: x01094
title: "The mutex heartbeat spec counts heartbeats on a clock it advances itself"
kind: fix
status: in-progress
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: 857ba8ad-259c-4720-a57e-4e802b036cb2
last-correlation-id: 857ba8ad-259c-4720-a57e-4e802b036cb2
last-transition-from: review
last-transition-at: 2026-11-18T07:30:53.481Z
---

# x01094 — The mutex heartbeat spec counts heartbeats on a clock it advances itself

## goal

'heartbeats keep the lock live across long critical sections' in with-file-mutex.property.spec.ts drives withFileMutex's setInterval heartbeat, its setTimeout waits and its Date.now reads with vitest fake timers advanced by the test, so the number of heartbeats is a function of the time the test advances and never of how loaded the machine is.

## why

On 2026-11-18 develop's certifying run b2db72a8f (run 44231434720, job 134557779007) failed only this test: 'timed out waiting for test condition' at waitFor, because fewer than two 20 ms heartbeats fired in the 400 ms real-time window on a loaded CI runner. It passes 3 of 3 locally. A red certification stops the queue for every pull request, and a rerun hides the cause; the owner's rule is that a flaky test gets its race removed, not a retry.

## non-goals

- Changing withFileMutex's behaviour or its lease, heartbeat or stale constants.
- Rewriting the other property tests in the file unless they share the same real-time wait.

## slices

- global_gate: lint

### S1 — Fake timers for the heartbeat case
- **Status**: review
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.property.e2e.spec.ts`, `tools/scripts/test/test-time-budget.migration.json`, `tools/scripts/lint/no-sleep-in-specs.baseline.json`
- **Gate**: lint
- acceptance:
  - "The heartbeat test calls vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] }) and restores real timers in a finally or afterEach."
  - "Every wait in that test advances the fake clock with vi.advanceTimersByTimeAsync instead of sleeping, and asserts heartbeatCount equals the number of heartbeat periods advanced (no lower bound slack)."
  - "The test passes 20 times in a row under `nice -n 19 npx vitest run packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts --maxWorkers=2` while another vitest run loads the machine, and its own time stays under the default 200 ms budget or names its budget."
  - "If a real-time waitFor remains in another test of the file and depends on scheduler latency, it moves to the same fake-clock pattern in this slice."
  - "The two slow tests (enumerated schedules, fast-check property) move unchanged (numRuns 60, same seed) to with-file-mutex.property.e2e.spec.ts, each naming its budget; every test left in the unit file names a budget of at most 200 ms and the unit file leaves the test-time-budget migration list."
- shipped-in: `ab54f38257c6`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- The heartbeat test calls vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] }) and restores real timers in a finally or afterEach.
- Every wait in that test advances the fake clock with vi.advanceTimersByTimeAsync instead of sleeping, and asserts heartbeatCount equals the number of heartbeat periods advanced (no lower bound slack).
- The test passes 20 times in a row under `nice -n 19 npx vitest run packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts --maxWorkers=2` while another vitest run loads the machine, and its own time stays under the default 200 ms budget or names its budget.
- If a real-time waitFor remains in another test of the file and depends on scheduler latency, it moves to the same fake-clock pattern in this slice.
- The two slow tests (enumerated schedules, fast-check property) move unchanged to with-file-mutex.property.e2e.spec.ts, each naming its budget; the unit file names a budget on every test and leaves the migration list.
