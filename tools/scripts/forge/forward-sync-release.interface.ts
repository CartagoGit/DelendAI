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

/** What one shelled-out command answered. */
export interface IForwardSyncCommandResult {
	readonly ok: boolean;
	readonly out: string;
	readonly err: string;
}

/**
 * The effects `openCandidate` performs, injected so a test can ask the
 * question that matters — in which ORDER — without a forge.
 */
export interface IForwardSyncOpenDeps {
	readonly run: (
		command: string,
		args: readonly string[],
	) => IForwardSyncCommandResult;
	readonly refuse: (lines: readonly string[]) => number;
	readonly log: (line: string) => void;
	/** Whether this is a workflow run, where the check must be started. */
	readonly inActions: () => boolean;
	/** How this project lands a pull request, as its policy declares. */
	readonly mergeMethod: () => 'squash' | 'merge' | 'rebase';
}
