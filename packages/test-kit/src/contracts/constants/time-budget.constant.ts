/** Constants for the per-test time budget. */

/** What a budget prefix looks like on a test name: `[<7ms] `. */
export const BUDGET_PREFIX = /^\[<(\d+(?:\.\d+)?)ms\] /u;

/** How a name starts when its author meant to write a budget. */
export const BUDGET_INTENT = '[<';

/** Names the JSON file that lists the spec files still allowed no budget. */
export const MIGRATION_ENV = 'DELENDAI_TEST_BUDGET_MIGRATION';

/** The directory the migration list's paths are relative to. */
export const MIGRATION_ROOT_ENV = 'DELENDAI_TEST_BUDGET_ROOT';

/**
 * Holds the files the change touches, one path a line (the workers inherit
 * it). Absent, the change is unknown and every file is held to its budget.
 */
export const CHANGED_ENV = 'DELENDAI_TEST_BUDGET_CHANGED';

/** Set to `1` for a run whose time overruns are reported, not failed. */
export const SOFT_OVERRUN_ENV = 'DELENDAI_TEST_BUDGET_SOFT';

/** A run naming this many spec files or more is the whole suite. */
export const WHOLE_SUITE_SPECS = 200;
