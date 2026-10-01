/**
 * unit-removal.service.ts — the one way a unit's worktree and local branch
 * leave a clone, shared by `work abandon` and the reaper so neither can
 * remove more than the other would.
 */
import { shortName } from '../development-policy/git-guard-namespaces';
import type { IUnitRemoval } from './unit-lease.interface';
import { removeUnitLease } from './unit-lease.store';
import { gitCommonDirOf } from './unit-lease.service';
import { inspectWorktree } from './unit-worktree-state.service';
import { readGit } from './work-unit-shared.service';

/** The worktree that has `ref` checked out, if any. */
export const worktreeOfRef = (root: string, ref: string): string | undefined =>
	(readGit(root, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n\n')
		.find((block) => block.split('\n').includes(`branch refs/heads/${ref}`))
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);

/**
 * Remove the worktree (when nothing in it is somebody's edit) and then the
 * local branch. A worktree holding only regenerable files is removed with
 * force: git counts them as changes and would otherwise keep it.
 */
export const removeUnitCheckout = async (
	root: string,
	ref: string,
): Promise<IUnitRemoval> => {
	const worktree = worktreeOfRef(root, ref);
	if (worktree !== undefined) {
		const state = inspectWorktree(worktree);
		if (state.edited.length > 0) {
			return {
				removedWorktree: null,
				deletedBranch: false,
				keptBecauseEdited: state.edited,
			};
		}
		const removed = readGit(root, [
			'worktree',
			'remove',
			...(state.regenerable.length > 0 ? ['--force'] : []),
			worktree,
		]);
		if (removed === undefined) {
			return {
				removedWorktree: null,
				deletedBranch: false,
				keptBecauseEdited: [],
			};
		}
	}
	const deleted =
		readGit(root, ['update-ref', '-d', `refs/heads/${ref}`]) !== undefined;
	const common = gitCommonDirOf(root);
	if (deleted && common !== undefined) await removeUnitLease(common, ref);
	return {
		removedWorktree: worktree ?? null,
		deletedBranch: deleted,
		keptBecauseEdited: [],
	};
};

/** Whether `ref` lies in the work namespace the policy declares. */
export const inWorkNamespace = (prefixSource: string, ref: string): boolean => {
	const prefix = shortName(prefixSource);
	return prefix.length > 0 && ref.startsWith(prefix);
};
