/**
 * branch-follow.helper.ts — a branch-pointed runtime follows its origin.
 *
 * Every start fetches the branch and fast-forwards the runtime's tree to
 * `origin/<branch>`, and nothing else: a tree that holds local commits, or
 * cannot fast-forward, is never reset, rebased or merged. It is reported,
 * with the ahead and behind counts, in a note the boot summary prints
 * loudly. With no network the server serves what it has and says the
 * fetch failed. The git runner is injected, so no spec touches a network.
 */
import type { TRun } from './branch-runtime.helper';

export interface IBranchFollow {
	/** What the boot summary says when the follow step was not a plain success. */
	readonly note?: string;
}

const FETCH_FAILED = 'fetching origin failed: serving what this tree holds';

const distance = (
	tree: string,
	sha: string,
	run: TRun,
): { readonly ahead: number; readonly behind: number } | undefined => {
	const counts = run(
		'git',
		['rev-list', '--left-right', '--count', `HEAD...${sha}`],
		tree,
	)?.split(/\s+/u);
	if (counts === undefined || counts.length < 2) return undefined;
	return { ahead: Number(counts[0]), behind: Number(counts[1]) };
};

/** Fetches `branch` into `root`, then fast-forwards `tree` to it when that is the only move needed. */
export const followBranch = (
	root: string,
	tree: string,
	branch: string,
	sha: string,
	fetched: boolean,
	run: TRun,
): IBranchFollow => {
	const stale = fetched ? '' : `${FETCH_FAILED}. `;
	const gap = distance(tree, sha, run);
	if (gap === undefined)
		return {
			note: `${stale}could not compare this tree with origin/${branch}; it was left as it is`,
		};
	if (gap.ahead > 0)
		return {
			note: `${stale}this tree holds ${gap.ahead} local commit(s) and is ${gap.behind} behind origin/${branch}: it was NOT reset or rebased (ahead ${gap.ahead}, behind ${gap.behind})`,
		};
	if (
		gap.behind > 0 &&
		run('git', ['merge', '--ff-only', '--quiet', sha], tree) === undefined
	)
		return {
			note: `${stale}could not fast-forward ${gap.behind} commit(s) to origin/${branch}: it was NOT reset or rebased (ahead 0, behind ${gap.behind})`,
		};
	return stale.length === 0 ? {} : { note: stale.trim() };
};
