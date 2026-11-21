/** What `work reap` found among the old test temp directories. */
export interface ITestTempLeftovers {
	/** Empty, old, with a pre-x01091 prefix: removed with --apply. */
	readonly empty: number;
	/** How many of those were removed (0 without --apply). */
	readonly removed: number;
	/** Old directories with a pre-x01091 prefix that hold something: listed, never removed. */
	readonly nonEmpty: readonly string[];
	/** How many non-empty ones there are in all. */
	readonly nonEmptyCount: number;
}
