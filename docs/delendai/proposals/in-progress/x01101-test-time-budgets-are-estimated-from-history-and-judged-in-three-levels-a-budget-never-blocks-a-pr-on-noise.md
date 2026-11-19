---
id: x01101
title: "Test time budgets are estimated from history and judged in three levels; a budget never blocks a PR on noise"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-19
last-transition-id: a18f5b6b-a4ec-4718-a5d2-42ee515d2a7f
last-correlation-id: a18f5b6b-a4ec-4718-a5d2-42ee515d2a7f
last-transition-from: ready
last-transition-at: 2026-11-19T15:27:10.007Z
---

# x01101 — Test time budgets are estimated from history and judged in three levels; a budget never blocks a PR on noise

## goal

A test's time estimate is the p95 of develop's recent CI runs normalized by load factor, kept in a calibration file CI updates; the runner judges ok, warning (up to +50%) or error (over +50%, reproduced or at normal load); unit-tier overruns only advise; editing a spec forces no budgets; self-learning turns recurring warnings into root-cause fixes.

## why

On 2026-11-19 PRs failed only on budgets: init-render (twice), review.tool, authoring and #3127. Budgets were guessed numbers judged against a noisy runner, and editing one line of a migration-listed spec forced budgets on all of its tests. The parts to reuse exist (test:budgets:calibrate, the load benchmark and load factor, the migration list); what is missing is an estimate computed from history and a judgment that tolerates noise.

## non-goals

- Raising the 200 ms unit tier or removing the [<Nms] test names
- A new load benchmark: the existing load factor is reused
- Blocking a PR on a warning

## slices

- global_gate: none

### S1 — Estimate per test id: p95 of develop runs, normalized by load factor
- **Status**: pending
- **Files**: `tools/scripts/ci/test-budget-calibration.ts`, `tools/scripts/ci/test-budget-calibration.spec.ts`, `tools/scripts/ci/test-budget-calibrate.script.ts`, `tools/scripts/test/test-time-estimates.json`, `.github/workflows/test-budget-calibration.yml`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "bunx vitest run tools/scripts/ci/test-budget-calibration.spec.ts proves the estimate is the p95 of the develop runs' load-normalized times, not the max, and that a run measured under a doubled load factor yields the same estimate"
  - "bunx vitest run tools/scripts/ci/test-budget-calibration.spec.ts proves a test with no estimate gets a provisional one from its first green run and that no author edit of tools/scripts/test/test-time-estimates.json is needed"
  - "`bun run test:budgets:calibrate --from-develop=5` prints the estimates it would write and writes them only on develop (the scheduled workflow), never on a PR"

### S2 — Three levels on the load-normalized time in the runner
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/test-kit/src/lib/time-budget/time-budget-runner.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget.helper.ts`, `packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts`, `packages/test-kit/src/contracts/constants/time-budget.constant.ts`, `packages/test-kit/src/contracts/interfaces/time-budget.interface.ts`, `packages/test-kit/tests/src/lib/time-budget-runner.helper.spec.ts`, `packages/test-kit/tests/src/lib/time-budget-tier.helper.spec.ts`, `packages/test-kit/tests/src/lib/time-budget.helper.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "bunx vitest run packages/test-kit/tests/src/lib/time-budget.helper.spec.ts proves load-normalized time within the estimate is ok, up to +50% is warning and over +50% is error"
  - "bunx vitest run packages/test-kit/tests/src/lib/time-budget-tier.helper.spec.ts proves a unit-tier test over 200 ms only warns 'move to e2e or use fakes' and never fails"
  - "bunx vitest run packages/test-kit/tests/src/lib/time-budget-runner.helper.spec.ts proves a test with no estimate never fails its first run and the runner records the warning with the shard load factor"

### S3 — The PR gate: an error needs a second run or a normal load; warnings are reported
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `tools/scripts/ci/test-budget-check.ts`, `tools/scripts/ci/test-budget-check.spec.ts`, `tools/scripts/ci/declared-test-budget.ts`, `tools/scripts/ci/declared-test-budget.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "bunx vitest run tools/scripts/ci/test-budget-check.spec.ts proves an over-+50% overrun fails only when a second run reproduces it or the run's load factor was normal, and passes (reported) on a single run under high load"
  - "bunx vitest run tools/scripts/ci/test-budget-check.spec.ts proves warnings and unit-tier advice are listed in the report and never set a non-zero exit"
  - "bunx vitest run tools/scripts/ci/declared-test-budget.spec.ts proves a changed or new test's first run never blocks"

### S4 — Retire the migration-list trap: editing a spec forces no budgets on its other tests
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/test-kit/src/lib/time-budget/may-go-unbudgeted.helper.ts`, `packages/test-kit/src/lib/time-budget/fresh-budget.helper.ts`, `tools/scripts/test/test-time-budget.migration.json`, `tools/scripts/test/time-budget-runner-is-shared.spec.ts`, `tools/scripts/ci/spec-duration-budget.script.ts`, `packages/test-kit/README.md`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "bunx vitest run tools/scripts/test/time-budget-runner-is-shared.spec.ts proves a one-line edit to a spec formerly listed in the migration file leaves its untouched tests without a budget demand"
  - "`git ls-files tools/scripts/test/test-time-budget.migration.json` prints nothing"
  - "`bun run test:budgets:check` exits 0 on a change that edits one line of a formerly listed spec"

### S5 — Self-learning groups recurring budget warnings and proposes the root-cause fix
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/self-learning/src/lib/collectors/test-journal.service.ts`, `plugins/self-learning/src/lib/lessons/derive-lessons.helper.ts`, `plugins/self-learning/src/lib/contracts/interfaces/observation.interface.ts`, `plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts`, `plugins/self-learning/tests/src/lib/store/observation-store.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "bunx vitest run plugins/self-learning/tests/src/lib/store/observation-store.spec.ts proves a budget warning is stored as an observation with the test id, the normalized time and the estimate"
  - "bunx vitest run plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts proves warnings recurring on specs that spawn git or use timers become one lesson proposing a fake instead of real git or timers"

## acceptance

- bunx vitest run tools/scripts/ci/test-budget-calibration.spec.ts proves the estimate is the p95 of the develop runs' load-normalized times, not the max, and that a run measured under a doubled load factor yields the same estimate
- bunx vitest run tools/scripts/ci/test-budget-calibration.spec.ts proves a test with no estimate gets a provisional one from its first green run and that no author edit of tools/scripts/test/test-time-estimates.json is needed
- `bun run test:budgets:calibrate --from-develop=5` prints the estimates it would write and writes them only on develop (the scheduled workflow), never on a PR
- bunx vitest run packages/test-kit/tests/src/lib/time-budget.helper.spec.ts proves load-normalized time within the estimate is ok, up to +50% is warning and over +50% is error
- bunx vitest run packages/test-kit/tests/src/lib/time-budget-tier.helper.spec.ts proves a unit-tier test over 200 ms only warns 'move to e2e or use fakes' and never fails
- bunx vitest run packages/test-kit/tests/src/lib/time-budget-runner.helper.spec.ts proves a test with no estimate never fails its first run and the runner records the warning with the shard load factor
- bunx vitest run tools/scripts/ci/test-budget-check.spec.ts proves an over-+50% overrun fails only when a second run reproduces it or the run's load factor was normal, and passes (reported) on a single run under high load
- bunx vitest run tools/scripts/ci/test-budget-check.spec.ts proves warnings and unit-tier advice are listed in the report and never set a non-zero exit
- bunx vitest run tools/scripts/ci/declared-test-budget.spec.ts proves a changed or new test's first run never blocks
- bunx vitest run tools/scripts/test/time-budget-runner-is-shared.spec.ts proves a one-line edit to a spec formerly listed in the migration file leaves its untouched tests without a budget demand
- `git ls-files tools/scripts/test/test-time-budget.migration.json` prints nothing
- `bun run test:budgets:check` exits 0 on a change that edits one line of a formerly listed spec
- bunx vitest run plugins/self-learning/tests/src/lib/store/observation-store.spec.ts proves a budget warning is stored as an observation with the test id, the normalized time and the estimate
- bunx vitest run plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts proves warnings recurring on specs that spawn git or use timers become one lesson proposing a fake instead of real git or timers
