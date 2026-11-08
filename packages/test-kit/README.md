# @delendai/test-kit

Internal, test-only helpers shared across @delendai workspaces (never published). Home of the typed partial-fake helper that replaces `as unknown as T` casts in test files.

## Use

Workspace-internal (`private`): it is consumed by other workspaces in this repository and is not published. Import from the package root or from `@delendai/test-kit/public`; see `AGENT.md` in this folder for the generated purpose, entry points and dependencies.

## Every test declares a maximum time

A test is written `it('does X', { meta: { budgetMs: 7 } }, fn)`. The runner
(`timeBudgetRunnerPath()`, set in `test.runner` of every project through
`sharedTestOptions`) measures the test body only, not shared hooks or the
import of the file, and **fails** a test that takes longer than it declared
or that declares nothing. The number is absolute: a laptop and CI judge it
against the same figure, with no hidden multiplier, so set it from the slower
of the two and fix a slow test instead of raising its number. The runner also
writes the `[<7ms]` prefix on the task name; a prefix typed by hand is read
the same way. It adds one clock read before and one after each test.

Existing spec files that still hold tests with no budget are listed in
`tools/scripts/test/test-time-budget.migration.json`. The list only shrinks
(`bun run lint:test-time-budget`; `--declared --update` drops a file that is
done). A file off the list must budget every test.

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
