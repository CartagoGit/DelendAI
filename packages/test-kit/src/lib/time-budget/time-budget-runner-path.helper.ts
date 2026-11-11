import { fileURLToPath } from 'node:url';

/**
 * Where the runner every vitest project loads lives. A project puts it in
 * `test.runner`; `sharedTestOptions` of this repository does so for all of
 * them, and a consuming project does the same from its own config.
 */
export const timeBudgetRunnerPath = (): string =>
	fileURLToPath(new URL('./time-budget-runner.helper.ts', import.meta.url));
