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
}
