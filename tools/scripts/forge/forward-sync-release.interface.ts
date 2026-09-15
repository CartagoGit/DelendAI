/** Types for `./forward-sync-release.script`. */

/** What was measured before anything is written. */
export interface IForwardSyncFacts {
	/** The release tip is already in the integration branch's history. */
	readonly releaseIsAncestor: boolean;
	/** Merging the release tip into the integration tip stopped. */
	readonly conflicts: boolean;
	/** The merged tree differs from the integration branch's tree. */
	readonly treeChanges: boolean;
}

/**
 * What carrying the release branch back amounts to.
 *
 * `ancestry-only` and `content` are both "open a pull request", and they
 * are still two names: the first changes no file and exists to end a
 * permanent "1 behind"; the second is a change that reached the release
 * branch without passing through integration, and the next promotion
 * would revert it.
 */
export type IForwardSyncVerdict =
	| 'in-sync'
	| 'ancestry-only'
	| 'content'
	| 'conflict';

/** The two branches the policy declares, by name. */
export interface IForwardSyncBranches {
	readonly integration: string;
	readonly release: string;
}
