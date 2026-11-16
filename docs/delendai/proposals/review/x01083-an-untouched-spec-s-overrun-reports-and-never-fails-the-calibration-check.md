---
id: x01083
title: "An untouched spec's overrun reports and never fails the calibration check"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: 2434a228-2cf8-41e8-9d2a-e5eacaf90525
last-correlation-id: 2434a228-2cf8-41e8-9d2a-e5eacaf90525
last-transition-from: in-progress
last-transition-at: 2026-11-16T13:52:26.797Z
---

# x01083 — An untouched spec's overrun reports and never fails the calibration check

## goal

The merge step's calibration check fails a change only for a budget overrun in a spec file the change touches; an overrun in an untouched spec is reported with its calibrated number and never fails, on a pull request and on an integration-branch push alike.

## why

Develop CI went red on 42d1c4936 in "Require the CI-calibrated number of every budget overrun" (`test:budgets:check`) for `forge-event-store.service.e2e.spec.ts > [<50ms] reads nothing from a file that is not a list`: CI measured 139.8 ms at load factor 1 (benchmark 20.0 ms against 42.8). The two previous develop runs passed the same step, and the merge between them does not touch that spec. The judge already reports, never fails, an overrun in a spec the change does not touch; the check is a second, stricter judge of the same rule, so one sample on an untouched spec turned develop red.

Why that test took 140 ms at load factor 1, from reading the test and the store: it calls `addForgeEventSubscription` only to create the directory, and that call is a durable write. It takes the file mutex, then `writeFileAtomic` creates a temporary file, writes it, fsyncs the data, renames it, fsyncs the directory, and sweeps orphan temporaries. There is no cold import in that path (every import is static, at module scope). The load benchmark is fifteen spawns and a hundred small writes with no fsync, so it cannot see the flush latency of the runner's disk, and a factor of 1 says nothing about it. The test asserts only that an unreadable subscriptions file reads as empty, so the durable write is not part of what it measures.

## non-goals

- Raising the number of that test, or of any budget, to fit.
- Changing how the judge in the test runner decides: it is the reference, and the check adopts its rule.

## slices

- global_gate: none

### S1 — The calibration check reports an untouched spec and fails a touched one
- **Status**: review
- **Files**: `tools/scripts/ci/test-budget-calibrate.script.ts`, `tools/scripts/ci/test-budget-calibration.ts`, `tools/scripts/ci/test-budget-check.ts`, `tools/scripts/ci/test-budget-check.spec.ts`, `packages/test-kit/src/lib/time-budget/time-budget-runner.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts`, `packages/core/tests/src/lib/forge-events/forge-event-store.service.e2e.spec.ts`, `packages/test-kit/src/public/index.ts`
- **Gate**: none
- shipped-in: `e4ed995bc0f8`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- One function, in `time-budget-tier.helper.ts`, says whether a spec file is untouched by a change (a known change set that does not hold the file); the test runner and the calibration check both call it, and neither keeps a copy.
- `test:budgets:check` takes the change set from `git diff --name-only <base>...HEAD` for the base in `SCOPE_BASE`. An overrun in a spec file the change touches prints the calibrated number and the step exits 1.
- An overrun in an untouched spec prints a warning line with the calibrated number, appends it to `GITHUB_STEP_SUMMARY` when that is set, and the step exits 0.
- An empty base (a push to the integration branch) is an empty change set, so every spec is untouched and the step reports and exits 0. It is never read as "everything touched".
- A missing or unreadable report directory, and a malformed report, exit 1 with a message.
- `test-budget-check.spec.ts` injects the reports, the change set and the summary writer and covers: untouched overrun exits 0 with the warning and the summary line, touched overrun exits 1, empty base exits 0, missing reports exit 1.
- The `reads nothing from a file that is not a list` test creates its directory with `mkdirSync` instead of a durable `addForgeEventSubscription`; its number stays `[<50ms]`.
