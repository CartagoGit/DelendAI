/** Shapes for `./lints-reach-ci.script`. */

/** One lint script and whether anything in CI can reach it. */
export interface ILintReachability {
	readonly script: string;
	/** The workflow command it is reachable from, when it is. */
	readonly via?: string | undefined;
}

/** What a reachability pass concluded. */
export interface IReachabilityReport {
	readonly total: number;
	readonly reachable: readonly ILintReachability[];
	/** Lint scripts no workflow can reach, directly or through another. */
	readonly unreachable: readonly string[];
	/** Unreachable and not recorded in the baseline: the failure. */
	readonly newlyUnreachable: readonly string[];
	/** Baselined entries that now run in CI: the win to lock in. */
	readonly nowReachable: readonly string[];
}
