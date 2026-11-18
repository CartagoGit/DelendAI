---
id: x01082
title: "A flame-graph capture does not fail under a loaded runner"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: e877fe2b-fae7-4b12-9141-03b78752c431
last-correlation-id: e877fe2b-fae7-4b12-9141-03b78752c431
last-transition-from: in-progress
last-transition-at: 2026-11-18T07:25:41.681Z
---

# x01082 — A flame-graph capture does not fail under a loaded runner

## goal

A flame-graph capture reports why it failed and its unit spec no longer races a 20 s wall-clock deadline against a loaded shard.

## why

Root cause: the unit spec `a flame-graph capture > keeps the CPU profile it recorded` spawned `node --prof` and then `node --prof-process` under a real 20 s wall-clock deadline (`timeoutMs: 20_000`). In CI run 43833059354 (commit 6eb6ce4c, a 192-file shard whose time was 65% transform) the test took 20094 ms and asserted `run.ok` false: the deadline expired, the child was killed, `runExternalTool` returned `timedOut: true`, and the assertion `expect(run.ok).toBe(true)` printed only "expected false to be true". Ruled out: a missing profile file (the run returned before reading it), a shared path (each call uses a random uuid scratch directory and profile name), an inherited env (none is read). The result also hid the reason: a timed-out child left `detail` empty, so nothing said a deadline had passed.

## why this design

- The deadline stays a real bound in production; the unit spec injects the exec instead of waiting on it.
- The real process moves to the e2e tier (load-stretched budget) rather than getting a longer timeout.
- Nothing is undecided.

## non-goals

- - The capture's deadline value and the workload do not change: the production deadline is a real bound and stays.
- No retry, no raised timeout.

## slices

- global_gate: none

### S1 — Injected exec seam, deadline reason, real-process spec in the e2e tier
- **Status**: review
- **Files**: `plugins/perf/src/lib/profile/real-perf-profile-deps.ts`, `plugins/perf/src/lib/contracts/interfaces/perf.interface.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.spec.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps-deadline.spec.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts`
- **Gate**: type
- **Decisions**: The e2e spec's profiler deadline is 20000 ms times loadFactorFromEnv of LOAD_FACTOR_ENV, the factor that stretches the e2e test budget. The workload is unchanged: measured locally it runs in 0.07 s and --prof-process in 0.9 s, so the CI overrun was load, not workload size.
- acceptance:
  - "real-perf-profile-deps-deadline.spec.ts passes: realPerfProfileDeps takes an optional exec seam passed to both runExternalTool calls, so the capture is testable without a process."
  - "real-perf-profile-deps-deadline.spec.ts passes: a failed profiling or log-processing step returns detail that names the deadline when the child timed out."
  - "real-perf-profile-deps-deadline.spec.ts proves with an injected exec that a timeout gives ok false, timedOut true and a deadline detail, and that a successful run keeps the .cpuprofile it recorded, with no process and no timer."
  - "The real-process capture is real-perf-profile-deps.e2e.spec.ts, in the e2e tier whose budget stretches with the runner load, and asserts on the whole result so a red run shows why."
  - "real-perf-profile-deps.e2e.spec.ts passes: the e2e spec's profiler timeoutMs is 20000 ms times the load factor the runner stretches the test budget by (LOAD_FACTOR_ENV), so the inner deadline and the [<20000ms] budget scale together."
- shipped-in: `7891a84831a5`
- review-state: in_review
- review-implementer: claude-sonnet-5-5
- review-log: requested_changes by gpt-5.3-codex — Need empirical acceptance evidence in this review round (validate exit code, test pass/total, and shipped commit hash) so the slice can be approved under current review policy.

## acceptance

- The injected-exec unit spec and the e2e spec named in S1 pass; the failing assertion prints the whole result.
