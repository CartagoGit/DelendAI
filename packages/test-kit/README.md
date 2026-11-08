# @delendai/test-kit

Internal, test-only helpers shared across @delendai workspaces (never published). Home of the typed partial-fake helper that replaces `as unknown as T` casts in test files.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/test-kit/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Every test declares a maximum time

A test starts its name with its maximum, `it('[<7ms] does X', fn)`. The
runner (`timeBudgetRunnerPath()`, set in `test.runner` of every project
through `sharedTestOptions`) reads the number from the name, measures the test
body only, not shared hooks or the import of the file, and **fails** a test
that takes longer, has no prefix, or has a malformed one. The number is
absolute: a laptop and CI judge it against the same figure, with no hidden
multiplier, so set it from the slower of the two and fix a slow test instead
of raising its number. It adds one clock read before and one after each test.

Existing spec files that still hold tests with no budget are listed in
`tools/scripts/test/test-time-budget.migration.json`. The list only shrinks
(`bun run lint:test-time-budget`; `--declared --update` drops a file that is
done), and a spec file the change edits must leave it and budget every test.
A test with no budget fails only in a spec file the change touches (the
changed-files input the lint uses), so a test an older branch lands cannot turn
develop or another change red. With the change unknown, every file is held to
it.

An over-budget test fails in CI and in a bounded run. In a local run whose
selection is the whole suite (no filter, or 200 spec files or more) the machine
is saturated by the run itself, so wall time measures the machine: the overruns
are reported as one summary of warnings and do not fail. A missing or malformed
budget fails in every run.

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
