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
