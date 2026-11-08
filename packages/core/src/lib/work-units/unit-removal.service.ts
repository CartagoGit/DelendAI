/**
 * unit-removal.service.ts — the one way a unit's worktree and local branch
 * leave a clone, shared by the reaper and the end of finished units so
 * neither can remove more than the other would, nor a unit still alive.
 */
import { shortName } from '../development-policy/git-guard-namespaces';
import type { IUnitRemoval } from './unit-lease.interface';
import { removeUnitLease } from './unit-lease.store';
import { gitCommonDirOf } from './unit-lease.service';
import { inspectWorktree } from './unit-worktree-state.service';
import { unitLifeNow } from './unit-liveness.service';
import { readGit } from './work-unit-shared.service';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

/** The worktree that has `ref` checked out, if any. */
export const worktreeOfRef = (root: string, ref: string): string | undefined =>
	(readGit(root, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n\n')
		.find((block) => block.split('\n').includes(`branch refs/heads/${ref}`))
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);

const kept = (
	reason: Partial<
		Pick<
			IUnitRemoval,
			'keptBecauseEdited' | 'keptBecauseAlive' | 'keptBecauseMoved'
		>
	> = {},
): IUnitRemoval => ({
	removedWorktree: null,
	deletedBranch: false,
	keptBecauseEdited: [],
	...reason,
});

/**
 * Remove a unit judged spent: its branch first, by compare-and-swap at
 * the tip it was judged at, and its worktree only once that succeeded.
 * The unit's life is read again immediately before each step: one that
 * came alive since the judgement is kept whole, its branch put back at
 * the judged tip. A worktree holding somebody's edits stays, unless the
 * caller kept them elsewhere; `--force` is used only for regenerable
 * files git counts as changes, or edits so kept, and never while a
 * process works inside (that is life, and keeps the unit).
 */
export const removeUnitCheckout = async (
	root: string,
	ref: string,
	options: {
		readonly policy: IResolvedDevelopmentPolicy;
		/**
		 * The tip the unit was judged spent at. The branch is deleted only
		 * while it is still there: one another session committed on since
		 * is not the unit that was judged.
		 */
		readonly tip: string;
		readonly editsKept?: boolean;
		/** Epoch seconds the unit was judged at; the clock by default. */
		readonly now?: number | undefined;
	},
): Promise<IUnitRemoval> => {
	const branch = `refs/heads/${ref}`;
	const worktree = worktreeOfRef(root, ref);
	const lifeNow = () =>
		unitLifeNow({
			root,
			policy: options.policy,
			ref,
			worktree: worktree ?? null,
			now: options.now,
		});
	const editsInTheWay = (): readonly string[] => {
		if (worktree === undefined || options.editsKept === true) return [];
		return inspectWorktree(worktree).edited;
	};
	const before = await lifeNow();
	if (before.alive) return kept({ keptBecauseAlive: before.why });
	const edited = editsInTheWay();
	if (edited.length > 0) return kept({ keptBecauseEdited: edited });
	// The branch goes first, and only at the judged tip.
	if (readGit(root, ['update-ref', '-d', branch, options.tip]) === undefined)
		return kept({ keptBecauseMoved: true });
	const restore = (): void => {
		readGit(root, ['update-ref', branch, options.tip, '']);
		if (worktree !== undefined)
			readGit(worktree, ['symbolic-ref', 'HEAD', branch]);
	};
	if (worktree !== undefined) {
		// Its HEAD named the branch just deleted: held at the judged tip,
		// git reads the tree against it again instead of calling every
		// file a change.
		if (
			readGit(worktree, [
				'update-ref',
				'--no-deref',
				'HEAD',
				options.tip,
			]) === undefined
		) {
			restore();
			return kept();
		}
		const after = await lifeNow();
		if (after.alive) {
			restore();
			return kept({ keptBecauseAlive: after.why });
		}
		const state = inspectWorktree(worktree);
		if (state.edited.length > 0 && options.editsKept !== true) {
			restore();
			return kept({ keptBecauseEdited: state.edited });
		}
		const removed = readGit(root, [
			'worktree',
			'remove',
			...(state.regenerable.length > 0 || state.edited.length > 0
				? ['--force']
				: []),
			worktree,
		]);
		if (removed === undefined) {
			restore();
			return kept();
		}
	}
	const common = gitCommonDirOf(root);
	if (common !== undefined) await removeUnitLease(common, ref);
	return {
		removedWorktree: worktree ?? null,
		deletedBranch: true,
		keptBecauseEdited: [],
	};
};

/**
 * Drop the forge's copy of a unit's branch once the unit is spent, only
 * while it is still at `tip`: a copy another machine moved on is
 * somebody's work and stays. A unit's branch is pushed on every commit,
 * so without this a finished proposal's branch stayed on the forge for
 * good.
 */
export const dropForgeCopy = (
	root: string,
	remote: string,
	ref: string,
	tip: string,
): boolean =>
	readGit(root, [
		'push',
		'--quiet',
		`--force-with-lease=refs/heads/${ref}:${tip}`,
		remote,
		`:refs/heads/${ref}`,
	]) !== undefined;

/** Whether `ref` lies in the work namespace the policy declares. */
export const inWorkNamespace = (prefixSource: string, ref: string): boolean => {
	const prefix = shortName(prefixSource);
	return prefix.length > 0 && ref.startsWith(prefix);
};
