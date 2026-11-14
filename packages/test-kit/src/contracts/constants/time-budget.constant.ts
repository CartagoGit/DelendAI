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

/**
 * Holds the budgets the change declares or changes, one `file<TAB>name` a
 * line. No CI measurement exists for such a number yet, so its overrun is
 * reported with the number CI calls for and the merge step requires it,
 * instead of failing the shard (`freshBudgetsOfDiff`).
 */
export const FRESH_ENV = 'DELENDAI_TEST_BUDGET_FRESH';

/** Set to `1` for a run whose time overruns are reported, not failed. */
export const SOFT_OVERRUN_ENV = 'DELENDAI_TEST_BUDGET_SOFT';

/**
 * The key under which the runner leaves the measured body time (ms) in a
 * test's `meta`, so a CI report carries what the runner judged and
 * `test:budgets:calibrate` reads it back.
 */
export const MEASURED_META_KEY = 'budgetTookMs';

/** The most a unit-tier test (any spec that is not e2e) may take, in real time. */
export const UNIT_LIMIT_MS = 200;

/** A shard that runs slower than the reference may stretch e2e budgets this far, never beyond; a faster one never shrinks them. */
export const LOAD_FACTOR_MIN = 1;
export const LOAD_FACTOR_MAX = 4;

/** Holds the shard's load factor (this shard's benchmark time over the reference, clamped), for the workers. */
export const LOAD_FACTOR_ENV = 'DELENDAI_TEST_BUDGET_LOAD';

/** Holds the shard's benchmark time in ms, so a report carries what the factor came from. */
export const LOAD_BENCH_ENV = 'DELENDAI_TEST_BUDGET_BENCH_MS';

/** Meta keys the runner leaves beside the measured time. */
export const MEASURED_LOAD_META_KEY = 'budgetLoadFactor';
export const MEASURED_BENCH_META_KEY = 'budgetBenchMs';
