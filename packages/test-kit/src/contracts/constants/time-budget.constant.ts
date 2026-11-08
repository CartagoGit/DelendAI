/** Constants for the per-test time budget. */

/** What a budget prefix looks like on a test name: `[<7ms] `. */
export const BUDGET_PREFIX = /^\[<(\d+(?:\.\d+)?)ms\] /u;

/** How a name starts when its author meant to write a budget. */
export const BUDGET_INTENT = '[<';

/** Names the JSON file that lists the spec files still allowed no budget. */
export const MIGRATION_ENV = 'DELENDAI_TEST_BUDGET_MIGRATION';

/** The directory the migration list's paths are relative to. */
export const MIGRATION_ROOT_ENV = 'DELENDAI_TEST_BUDGET_ROOT';
