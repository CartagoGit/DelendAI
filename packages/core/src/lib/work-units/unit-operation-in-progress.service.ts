/**
 * unit-operation-in-progress.service.ts — a merge, rebase or cherry-pick
 * its owner has begun is work in progress, not uncommitted work.
 *
 * Start-up reconciliation committed an agent's merge (conflicts resolved,
 * MERGE_HEAD present, not yet committed) under "keep the uncommitted work
 * found at start" while the agent was still working on it. A unit that is
 * live is never touched. One that is not has a merge kept under a message
 * that names it; a rebase or cherry-pick is left as it is, because a
 * commit in the middle of one corrupts it.
 */
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';

/** The operations git leaves half done in a worktree, by the file that marks each. */
const OPERATION_MARKERS = [
	['merge', 'MERGE_HEAD'],
	['rebase', 'REBASE_HEAD'],
	['cherry-pick', 'CHERRY_PICK_HEAD'],
] as const;

const markerPresent = async (
	inTree: IGitRunner,
	worktree: string,
	marker: string,
): Promise<boolean> => {
	const where = await inTree(['rev-parse', '--git-path', marker]);
	if (!where.ok) return false;
	return access(resolve(worktree, where.output.trim())).then(
		() => true,
		() => false,
	);
};

/**
 * What becomes of an operation in progress in the worktree of a unit
 * nobody is on: nothing when there is none, `kept` with the new tip for a
 * merge whose conflicts are resolved, `left` with the reason otherwise.
 */
export const settleOperationInProgress = async (
	inTree: IGitRunner,
	worktree: string,
): Promise<
	| { readonly kind: 'kept'; readonly tip: string }
	| { readonly kind: 'left'; readonly detail: string }
	| undefined
> => {
	for (const [kind, marker] of OPERATION_MARKERS) {
		if (!(await markerPresent(inTree, worktree, marker))) continue;
		const open = (await inTree(['diff', '--name-only', '--diff-filter=U']))
			.output;
		if (kind !== 'merge' || open.trim() !== '') {
			return {
				kind: 'left',
				detail: `${worktree} has a ${kind} in progress${kind === 'merge' ? ' with conflicts still open' : ''}; it is left as it is for whoever finishes it`,
			};
		}
		const head = (
			await inTree(['rev-parse', '--short', marker])
		).output.trim();
		const merged =
			(await inTree(['add', '-A'])).ok &&
			(
				await inTree([
					'commit',
					'--quiet',
					'-m',
					`chore(wip): keep the merge of ${head} found at start`,
				])
			).ok;
		return merged
			? {
					kind: 'kept',
					tip: (await inTree(['rev-parse', 'HEAD'])).output.trim(),
				}
			: {
					kind: 'left',
					detail: `${worktree} has a merge of ${head} that could not be committed; it is still only on this machine`,
				};
	}
	return undefined;
};
