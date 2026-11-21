# @delendai/test-kit

Internal, test-only helpers shared across @delendai workspaces (never published). Home of the typed partial-fake helper that replaces `as unknown as T` casts in test files.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/test-kit/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Every test declares a maximum time

A test starts its name with its maximum, `it('[<7ms] does X', fn)`. The
runner (`timeBudgetRunnerPath()`, set in `test.runner` of every project
through `sharedTestOptions`) reads the number from the name, measures the test
body only, not shared hooks or the import of the file, and **fails** a test
that takes longer, or has a malformed prefix. The number is
absolute, with no hidden multiplier, and CI is where it is enforced and where
it is calibrated: a budget is `ceil(1.5 x the longest time CI measured for that
test)`, at least 4 ms above it. Fix a slow test instead of raising its number. It adds one clock read before and one after each test.

A test with no budget never fails: it is judged against its estimate from
history (`test:budgets:calibrate`), so editing one line of a spec asks nothing
of its other tests. A malformed budget (`[<ms]`) still fails everywhere.
`bun run lint:test-time-budget` only refuses a unit-tier spec the change edits
that declares a budget over the unit limit.

An over-budget test fails on CI (`GITHUB_ACTIONS`). Anywhere else, wall time
measures that machine, so the overruns are reported as one summary of warnings
and never fail. A malformed budget fails everywhere.

The runner leaves each test's measured body time in its `meta`, and every CI
shard uploads the longest per test as a `test-durations-*` artifact (14 days).
Set budgets from them:

```sh
bun run test:budgets:calibrate --from-ci=<run-id>           # list tests declaring less than CI measured
bun run test:budgets:calibrate --from-ci=<run-id> --update  # rewrite those numbers in the specs
```

A project that consumes delendai adds the same to each vitest config:

```ts
import { timeBudgetRunnerPath } from '@delendai/test-kit/public';
export default defineConfig({ test: { runner: timeBudgetRunnerPath() } });
```

Set `DELENDAI_TEST_BUDGET_MIGRATION` (a JSON `{ "unbudgeted": [paths] }`) and
`DELENDAI_TEST_BUDGET_ROOT` to migrate gradually; with neither set, every test
needs a budget.

## Develop

```sh
bun run --cwd packages/test-kit test
bun run --cwd packages/test-kit build
```
