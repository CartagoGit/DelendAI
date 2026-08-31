/**
 * Result of `mergeReleaseFixToDevelop`: the release branch's fixups
 * were integrated back into `develop` and pushed to the remote.
 *
 * `strategy` records whether the merge was a fast-forward (`ff`) or a
 * no-ff merge commit (`no-ff`). `mergeCommit` is undefined for the
 * fast-forward case and set to the new merge commit SHA otherwise.
 */
export interface IReleaseFixMerged {
	readonly releaseBranch: string;
	readonly developSha: string;
	readonly mergeCommit?: string;
	readonly strategy: 'ff' | 'no-ff';
	readonly upstream: string;
}

/** Input for `mergeReleaseFixToDevelop`. */
export interface IMergeReleaseFixInput {
	readonly releaseBranch: string;
	readonly fastForwardOnly?: boolean;
}

/**
 * Result of `openPromotionPr`: the prepared release branch was pushed
 * to its upstream and is ready for the human to open the PR toward
 * `main` (or for the script to invoke the GitHub provider).
 */
export interface IPromotionReady {
	readonly branch: string;
	readonly headSha: string;
	readonly upstream: string;
	readonly baseBranch: 'main';
}
