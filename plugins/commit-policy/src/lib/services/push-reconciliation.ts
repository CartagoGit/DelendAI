/**
 * push-reconciliation.ts — x00427 S1.
 *
 * What a tick should do, decided from the state of the branch rather
 * than from whether this process happened to make a commit.
 *
 * The bug this exists to close was observed on this repository: with
 * `push.enabled` and `push.onCommit` both configured, six commits sat
 * unpushed while the plugin reported itself healthy. Nothing was broken
 * downstream — a manual `git push --dry-run` passed all eight pre-push
 * checks. The push was simply never attempted.
 *
 * The reason is that `onCommit` fires under `result.commitCreated`, at
 * step 7 of the engine, and an interval tick over a clean worktree exits
 * at `stage` with `TRIGGER_HAS_NO_FILES` long before reaching it. So the
 * moment anything else commits — another agent from its terminal, a
 * hook, the operator — the tree goes clean, this engine creates no
 * commit, and `onCommit` never fires again. The remote falls behind in
 * silence, and nobody gets a signal, because from the inside nothing
 * failed: there was nothing to commit.
 *
 * The conceptual error is asking the wrong question. A push whose job is
 * to keep the remote in sync is a reconciliation of state, not a
 * reaction to an event of one's own. The question is not "did I just
 * commit?" but "is the branch ahead of its upstream?". A clean worktree
 * with unpushed commits is not "nothing to do"; it is "nothing to
 * commit, something to push".
 *
 * This module is only the decision. It runs no git and takes no lock, so
 * every case below is a table rather than a scenario — including the
 * ones that are awkward to stage for real, like a branch with no
 * upstream at all.
 */

/** What the caller observed about the branch, before deciding anything. */
export interface IBranchSyncState {
	readonly branch: string;
	/**
	 * Commits the local branch has that its upstream does not.
	 * `undefined` when the branch has no upstream configured — which is
	 * NOT the same as zero, and is the distinction this whole module
	 * turns on.
	 */
	readonly aheadCount: number | undefined;
	/** Paths dirty in the worktree right now. */
	readonly dirtyCount: number;
}

export interface IPushGuards {
	readonly enabled: boolean;
	readonly protectedBranches: readonly string[];
}

export type TReconciliationAction =
	| 'push-unpushed-commits'
	| 'nothing-to-do'
	| 'no-upstream'
	| 'push-disabled'
	| 'branch-protected';

export interface IReconciliationDecision {
	readonly action: TReconciliationAction;
	/** True only for the one action that actually pushes. */
	readonly shouldPush: boolean;
	/**
	 * Whether this is a normal resting state or something an operator
	 * should look at. A branch with no upstream is not an error, but it
	 * is not healthy silence either.
	 */
	readonly needsAttention: boolean;
	readonly reason: string;
}

const protectedMatch = (
	branch: string,
	protectedBranches: readonly string[],
): boolean =>
	protectedBranches.some(
		(candidate) =>
			candidate.trim() === branch.trim() && branch.trim() !== '',
	);

/**
 * Whether this tick should push.
 *
 * The guards come first and are absolute: this decision only changes
 * WHEN a push is attempted, never what the project allows. A disabled
 * push and a protected branch are refused before the branch state is
 * even considered, so no amount of drift can talk the system into a push
 * the configuration forbids.
 */
export const decidePushReconciliation = (
	state: IBranchSyncState,
	guards: IPushGuards,
): IReconciliationDecision => {
	if (!guards.enabled) {
		return {
			action: 'push-disabled',
			shouldPush: false,
			needsAttention: false,
			reason: 'push is disabled, so an out-of-date remote is the configured outcome and not a problem to solve',
		};
	}
	if (protectedMatch(state.branch, guards.protectedBranches)) {
		return {
			action: 'branch-protected',
			shouldPush: false,
			needsAttention: false,
			reason: `"${state.branch}" is a protected branch; reconciliation never pushes to one, whatever it is carrying`,
		};
	}
	if (state.aheadCount === undefined) {
		// Distinct from being up to date. There is nothing to be ahead OF,
		// so silence here would hide a branch whose work is going nowhere.
		return {
			action: 'no-upstream',
			shouldPush: false,
			needsAttention: true,
			reason: `"${state.branch}" has no upstream configured, so nothing can be reconciled; this is not an error but it is not in sync either`,
		};
	}
	if (state.aheadCount > 0) {
		const noun = state.aheadCount === 1 ? 'commit' : 'commits';
		return {
			action: 'push-unpushed-commits',
			shouldPush: true,
			needsAttention: false,
			reason: `"${state.branch}" is ${state.aheadCount.toString()} ${noun} ahead of its upstream${state.dirtyCount === 0 ? ' with a clean worktree' : ''}; whoever made them, they belong on the remote`,
		};
	}
	return {
		action: 'nothing-to-do',
		shouldPush: false,
		needsAttention: false,
		reason: `"${state.branch}" is level with its upstream`,
	};
};
