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
	/**
	 * Paths that can change the verdict, when a prefix cannot say it (every
	 * `package.json`, every entry file). Replaces `touches` when set.
	 */
	readonly matches?: RegExp | undefined;
	/**
	 * The entry files a published package exposes (`src/index.ts`, `cli.ts`…).
	 * A change to one counts for this job only when the names it exports moved
	 * (added, removed or re-pointed); a change to a module behind it does not,
	 * whatever `touches` or `matches` say. An entry that declares something
	 * itself, or whose delta cannot be bounded, counts as moved.
	 */
	readonly surface?: RegExp | undefined;
	/**
	 * `skip`: a change made only of Markdown (under docs/ or at the root)
	 * cannot change this job's verdict, whatever `touches` says.
	 */
	readonly docs?: 'skip' | undefined;
	/**
	 * Path prefixes whose listing the job reads (a directory walk, `git
	 * ls-files`): a file added or removed under one can change the verdict
	 * even though no file it reads changed. `''` is the whole tree.
	 */
	readonly lists?: readonly string[] | undefined;
	/**
	 * `scripts`: the job also runs when the change reaches, by symbol, one of
	 * the scripts it runs (`job-reach.helper.ts`), so its `touches` name only
	 * what it reads as data.
	 */
	readonly code?: 'scripts' | undefined;
	/** Why this bound is correct — read by whoever widens or narrows it. */
	readonly because: string;
}
