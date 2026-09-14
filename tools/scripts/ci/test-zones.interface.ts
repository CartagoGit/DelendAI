/** Types for `./test-zones.script`. */

/**
 * One named area of the repository that tests are grouped into.
 *
 * A zone is a NAME plus the rule that decides membership — never a
 * hand-written list of workspaces. A new plugin has to land in a zone
 * by itself, because the alternative is a list in a workflow file that
 * nobody updates and everybody trusts.
 */
export interface IZoneRule {
	/** Stable id used in the job name a reader sees on a pull request. */
	readonly id: string;
	/** First matching rule wins, so order is meaningful. */
	readonly match: (specPath: string) => boolean;
	/** Path filters handed to vitest for this zone. */
	readonly paths: (workspaceDirs: readonly string[]) => readonly string[];
	/**
	 * How expensive this zone's specs are RELATIVE to the repository's
	 * average, measured — never guessed. Omitted means 1.
	 *
	 * Splitting by spec count assumes every spec costs the same, which
	 * holds while module loading dominates (~89% of a typical shard) and
	 * fails completely for a zone whose specs do real work: spawn git,
	 * walk the repository, build a workspace. Measured on develop,
	 * `tools` ran 816s against 387s for the next slowest, which is 2.5x
	 * the per-job target — so it received ONE job while needing three,
	 * and set the critical path of every pull request in the queue.
	 *
	 * Re-derive it the same way: divide the zone's observed job duration
	 * by the target duration (~330s for TARGET_SPECS_PER_JOB). A weight
	 * that stops matching is a weight to re-measure, not to nudge.
	 */
	readonly costWeight?: number;
}

/** One CI job: a zone, possibly split because it is too big for one. */
export interface IZoneJob {
	/** `core`, or `core 2/2` when the zone had to be split. */
	readonly name: string;
	readonly zone: string;
	readonly paths: readonly string[];
	/** 1-based index within the zone; 1 when the zone is not split. */
	readonly shard: number;
	readonly shards: number;
	/** Spec files the zone holds — what the split was decided from. */
	readonly specs: number;
}
