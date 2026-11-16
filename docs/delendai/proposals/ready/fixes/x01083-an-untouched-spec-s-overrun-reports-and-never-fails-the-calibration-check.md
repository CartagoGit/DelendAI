---
id: x01083
title: "An untouched spec's overrun reports and never fails the calibration check"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-16
---

# x01083 — An untouched spec's overrun reports and never fails the calibration check

## goal

The merge step's calibration check fails a change only for a budget overrun in a spec file the change touches; an overrun in an untouched spec is reported with its calibrated number and never fails, on a pull request and on an integration-branch push alike.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The calibration check reports an untouched spec and fails a touched one
- **Status**: pending
- **Files**: `tools/scripts/ci/test-budget-calibrate.script.ts`, `tools/scripts/ci/test-budget-calibration.ts`, `tools/scripts/ci/test-budget-check.ts`, `tools/scripts/ci/test-budget-check.spec.ts`, `packages/test-kit/src/lib/time-budget/time-budget-runner.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts`, `packages/core/tests/src/lib/forge-events/forge-event-store.service.e2e.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
