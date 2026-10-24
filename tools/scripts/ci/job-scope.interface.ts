/** Types for `./job-scope.script`. */

/**
 * What a CI job is about.
 *
 * `always` is a first-class answer, not a missing one. Most jobs here
 * verify a property of the whole repository and genuinely cannot be
 * bounded; recording that explicitly is what makes the bounded ones
 * trustworthy, because then an absent entry means somebody forgot
 * rather than somebody decided.
 */
export interface IJobScope {
	/** The job id as it appears in `.github/workflows/ci.yml`. */
	readonly job: string;
	/**
	 * Path prefixes that can change this job's verdict, or `'always'`.
	 *
	 * Prefixes, deliberately, not globs: a prefix is checkable by
	 * reading it, and the cost of being too broad is a job that runs
	 * when it did not need to. The cost of being too narrow is a
	 * regression nobody looked for.
	 */
	readonly touches: readonly string[] | 'always';
	/** Why this bound is correct — read by whoever widens or narrows it. */
	readonly because: string;
}
