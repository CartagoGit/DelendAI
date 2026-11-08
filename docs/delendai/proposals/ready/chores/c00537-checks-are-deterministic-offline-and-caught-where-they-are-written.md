---
id: c00537
title: "Checks are deterministic, offline and caught where they are written"
kind: chore
status: ready
type: proposal
track: general
date: 2026-11-08
---

# c00537 — Checks are deterministic, offline and caught where they are written

## goal

CI stops being red for reasons that are not the change: specs do not wait on real clocks, the PR run needs no network, and proposal hygiene is refused by the tools that write proposals instead of by CI.

## why

Nov 2-8 CI data: PR runs take 4 min (median), full runs 7. Merged PRs took 0.2 h open-to-merge at p50 and 19 h at p90, the tail being queue blocking. develop was red 81 of 141 h (57%), almost always a timing or concurrency spec (compute-slot x7, maintenance-lease race, reclaim-worktrees, record-buffer time window, concurrent work enter x01048) plus one CI config error (vitest groupOrder). lint-governance failed 23 PR runs, mostly proposal hygiene; one proof failed on bun audit because of the network. 55 specs use a real setTimeout or sleep without a fake clock, of 161 that use timers.

## non-goals

- The gate model (sectioned PRs and trains, full suite only at promotion, per-section health) is q00045 S7, owned by another agent. Do not touch tools/scripts/forge.
- Never fix a flaky spec by running it N times; every fix names the cause.

## slices

- global_gate: none

### S1 — A lint refuses real timers, sleeps and wall-clock waits in specs; fix the offenders
- **Status**: pending
- **Files**: `tools/scripts/lint/no-sleep-in-specs.script.ts`, `tools/scripts/lint/no-sleep-in-specs.constant.ts`, `tools/scripts/lint/no-sleep-in-specs.interface.ts`, `tools/scripts/lint/no-sleep-in-specs.script.spec.ts`, `tools/scripts/lint/no-sleep-in-specs.baseline.json`
- **Gate**: none
- acceptance:
  - "The lint refuses a spec that waits on a real timer or sleep unless it goes through @delendai/test-kit (useFakeClock and its peers) or a declared deterministic barrier"
  - "Specs that turned develop red are fixed first, each commit stating the cause"
  - "The baseline only shrinks"

### S2 — No network in prove or the PR run; network gates run at promotion and on a schedule
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/dependency-advisories.script.ts`, `package.json`
- **Gate**: none
- acceptance:
  - "bun audit and any other network gate do not run in prove or the PR run"
  - "They run at the develop to main promotion and on a schedule"

### S3 — Proposal-writing tools refuse what the governance and hygiene lints refuse
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`
- **Gate**: none
- acceptance:
  - "Scaffold TODOs and the other hygiene findings are refused at write time, so they never reach CI"

### S4 — pr-ci-cost reports weekly develop red hours, PR open-to-merge p50/p90, runs per PR and top failure causes
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/pr-ci-cost.script.ts`, `tools/scripts/ci/pr-ci-cost.interface.ts`
- **Gate**: none
- acceptance:
  - "The report prints these numbers per week"

### S5 — Coverage instruments only the changed source files
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `vitest.shared.ts`, `tools/scripts/ci/changed-file-coverage.script.ts`
- **Gate**: none
- acceptance:
  - "Every shard collects v8 coverage only over the source files the change touches (coverage.include from the change), since the gate is changed-file coverage"
  - "Shard time is measured before and after and both numbers are in the commit body"

### S6 — The slowest specs become near-instant with test-kit
- **Status**: pending
- **DependsOn**: [S7]
- **Files**: `packages/core/tests/src/lib/development-policy/work-unit.service.e2e.spec.ts`, `packages/core/tests/src/lib/public/deprecation.spec.ts`, `packages/core/tests/src/lib/cli/state-registry-is-chosen.spec.ts`
- **Gate**: none
- acceptance:
  - "The slowest specs of a CI shard (full list with durations from the vitest JSON reporter) use in-memory git or repo templates, a fake clock and no tsc spawn"
  - "The over-budget list of S7 shrinks with each fix; no budget is raised to make a test pass"

### S7 — Every test declares a maximum time, enforced by code
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/test-kit/src/lib/time-budget/time-budget-runner.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget.helper.ts`, `packages/test-kit/README.md`, `tools/scripts/ci/spec-duration-budget.script.ts`, `tools/scripts/ci/declared-test-budget.ts`, `tools/scripts/test/test-time-budget.migration.json`, `vitest.shared.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: none
- acceptance:
  - "Every test carries its maximum as [<Nms] at the front of its name, written by the runner from the test's meta.budgetMs (a prefix typed by hand is read the same way); no test may go without one"
  - "A test that exceeds its budget fails, and so does one with no budget; the test-kit runner is loaded for every project from sharedTestOptions in vitest.shared.ts with no opt-out, and adds one clock read before and after each test"
  - "Only the test body is measured, not hooks or the file import. The number is absolute, so CI and local machines judge the same test against the same figure with no hidden multiplier; set it from the slower of the two"
  - "tools/scripts/ci/spec-duration-budget.script.ts gains the declared-budget check (no second lint); a lint and a spec of the shared config prove every vitest project loads the runner"
  - "Spec files still holding tests with no budget are on tools/scripts/test/test-time-budget.migration.json, which may only shrink; renaming them follows in batches"
  - "The rule is documented in the bootstrap (within its byte budget) and the test-kit README, with the config line a consuming project adds"

## acceptance

- The lint refuses a spec that waits on a real timer or sleep unless it goes through @delendai/test-kit (useFakeClock and its peers) or a declared deterministic barrier
- Specs that turned develop red are fixed first, each commit stating the cause
- The baseline only shrinks
- bun audit and any other network gate do not run in prove or the PR run
- They run at the develop to main promotion and on a schedule
- Scaffold TODOs and the other hygiene findings are refused at write time, so they never reach CI
- The report prints these numbers per week
- Coverage instruments only changed source files and shard time is measured before and after
- The slowest specs are made fast and the over-budget list shrinks
- Every test declares a maximum, written by code, and exceeding it fails the run; the list of tests without one only shrinks
