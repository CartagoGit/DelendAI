/** The migration list: spec files that may still hold tests with no budget. */
export interface ITimeBudgetMigration {
	/** Repository-relative paths, `/`-separated. Only ever shrinks. */
	readonly unbudgeted: readonly string[];
}

/** One test's measurement against what it declared. */
export interface ITimeBudgetCase {
	/** The test's name, which carries its `[<Nms]` prefix. */
	readonly name: string;
	/** Whether the test's file is on the migration list. */
	readonly migrating: boolean;
	/** How long the body took. */
	readonly tookMs: number;
	/**
	 * Report an overrun instead of failing it: budgets are enforced and
	 * calibrated in CI, so a run anywhere else only warns.
	 */
	readonly softOverrun?: boolean;
	/**
	 * The change declares or changes this budget, so CI has never measured
	 * it: an overrun is reported for correction, not failed here.
	 */
	readonly fresh?: boolean;
	/**
	 * The tier the test's file belongs to: `unit` fails past 200 ms of real
	 * time and ignores its name's number; `e2e` fails past its declared
	 * number times the load factor. Absent, the test is judged by its name
	 * alone, as before tiers existed.
	 */
	readonly tier?: 'unit' | 'e2e';
	/** This shard's load factor, 1 to 4; 1 when unknown. */
	readonly loadFactor?: number;
}
