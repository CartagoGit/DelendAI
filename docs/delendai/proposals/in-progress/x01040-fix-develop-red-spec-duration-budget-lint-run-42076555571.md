---
id: x01040
title: "Fix develop red: spec-duration-budget lint (run 42076555571)"
kind: fix
status: in-progress
type: proposal
track: ci
date: 2026-11-07
last-transition-id: 9a8d832c-c7a7-4ece-9960-e38e7cb3988f
last-correlation-id: 9a8d832c-c7a7-4ece-9960-e38e7cb3988f
last-transition-from: ready
last-transition-at: 2026-11-07T10:12:25.326Z
---

# x01040 — Fix develop red: spec-duration-budget lint (run 42076555571)

## goal

Develop is red at 1f8f5acee (CI run 42076555571): spec-duration-budget fails kept-unit-hydration.service.spec.ts (7495 ms) and shared-checkout-clean.service.spec.ts (6142 ms). Make both fast with test-kit; make the gate robust to runner noise.

## why

CI run 42076555571 left develop red at 1f8f5acee: the spec-duration-budget lint (q00045 S1) failed two specs over 5 s that are not in its baseline, so the queue arms no pull request. A wall clock on shared runners must not turn develop red from noise, so the gate also needs a margin, a median, and a report-only mode on the integration branch.

## non-goals

- Optimising `work enter` itself (about 115 git calls per enter).
- Wiring the download of earlier runs' timings in CI (the median is supported by `--history`).

## slices

- global_gate: none

### S1 — Fast specs and a noise-robust duration gate
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/work-units/kept-unit-hydration.service.spec.ts`, `packages/core/tests/src/lib/work-units/shared-checkout-clean.service.spec.ts`, `tools/scripts/ci/spec-duration-budget.ts`, `tools/scripts/ci/spec-duration-budget.script.ts`, `tools/scripts/ci/spec-duration-budget.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: none

## acceptance

- The two specs use `createGitRepoTemplate` and pass under vitest.
- A file is a failure only over 7.5 s (5 s with a 1.5 margin); the median of `--history` runs is judged when given.
- `--mode=integration` exits 0 and writes the offenders; CI opens or refreshes an issue for them.
- `--mode=pull-request` still fails a clearly slow spec.
