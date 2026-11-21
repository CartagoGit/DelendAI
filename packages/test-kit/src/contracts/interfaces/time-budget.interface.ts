/** One test's measurement against what it declared. */
export interface ITimeBudgetCase {
	/** The test's name, which carries its `[<Nms]` prefix. */
	readonly name: string;
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
	readonly tier?: 'unit' | 'e2e' | undefined;
	/** This shard's load factor, 1 to 4; 1 when unknown. */
	readonly loadFactor?: number;
	/**
	 * Set when the test ran over its stretched budget and the load was
	 * measured again right then: the factor measured at the shard's start.
	 * `loadFactor` is then the larger of the two, the one the test is
	 * judged against.
	 */
	readonly loadFactorAtStart?: number | undefined;
	/** The factor measured again when the test ran over; see `loadFactorAtStart`. */
	readonly loadFactorNow?: number | undefined;
}
