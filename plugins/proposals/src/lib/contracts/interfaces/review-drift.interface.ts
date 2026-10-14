/** How far the repository moved under a proposal waiting for review. */
export type IReviewDrift =
	| {
			readonly measured: true;
			readonly reviewAgeDays: number;
			readonly commitsSince: number;
			readonly filesTouchedSince: readonly string[];
			readonly files: number;
			readonly driftRatio: number;
	  }
	| { readonly measured: false; readonly reason: string };

/** The git facts a drift measure needs, injectable for tests. */
export interface IReviewGitFacts {
	/** Commit time in ms, or `undefined` when the commit is unknown here. */
	readonly commitTimeMs: (sha: string) => number | undefined;
	readonly commitsSince: (sha: string) => number;
	/** The given files that later commits touched, even if reverted. */
	readonly filesTouchedSince: (
		sha: string,
		files: readonly string[],
	) => readonly string[];
}
