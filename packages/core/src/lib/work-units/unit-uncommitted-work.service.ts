/**
 * unit-uncommitted-work.service.ts — what start-up reconciliation does with
 * the worktree of a unit nobody is working in: edits are work too, kept
 * before they are pushed; a merge, rebase or cherry-pick its owner left
 * half done is settled by unit-operation-in-progress.
 */
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IUnitForgeSync } from '../contracts/interfaces/unit-forge-sync.interface';
import { commitPendingCallWrites } from '../shared/commit-call-writes';
import { settleOperationInProgress } from './unit-operation-in-progress.service';

/**
 * A worktree whose pending change deletes more than half of what its unit
 * tracks lost its files; it was not edited. Kept as "uncommitted work",
 * that deletion was committed and pushed as the whole repository's
 * removal (4,928 files, 2026-10-22). The unit's work is its ref.
 */
const lostCheckout = async (
	inTree: (
		args: readonly string[],
	) => Promise<{ readonly ok: boolean; readonly output: string }>,
	porcelain: string,
): Promise<
	{ readonly deleted: number; readonly tracked: number } | undefined
> => {
	const deleted = porcelain
		.split('\n')
		.filter((line) => /^(?: D|D |DD)/u.test(line)).length;
	if (deleted === 0) return undefined;
	const listed = await inTree(['ls-tree', '-r', '--name-only', 'HEAD']);
	const tracked = listed.ok
		? listed.output.split('\n').filter((line) => line.length > 0).length
		: 0;
	return tracked > 0 && deleted * 2 > tracked
		? { deleted, tracked }
		: undefined;
};

/**
 * Keep what the worktree holds that no commit does. `stop` when the unit
 * is to be left as it is (nothing is pushed for it this pass); `tip` is
 * the unit's new tip when something was committed.
 */
export const keepUnitWork = async (
	inTree: IGitRunner,
	worktree: string,
	branch: string,
): Promise<{
	readonly synced: readonly IUnitForgeSync[];
	readonly stop: boolean;
	readonly tip?: string;
}> => {
	const synced: IUnitForgeSync[] = [];
	let tip: string | undefined;
	// A merge, rebase or cherry-pick begun and not finished is work in
	// progress, not "uncommitted work".
	const operation = await settleOperationInProgress(inTree, worktree);
	if (operation?.kind === 'left') {
		return {
			synced: [{ branch, outcome: 'failed', detail: operation.detail }],
			stop: true,
		};
	}
	if (operation?.kind === 'kept') {
		tip = operation.tip;
		synced.push({ branch, outcome: 'kept-uncommitted' });
	}
	// A tool's writes its own commit missed go in under its subject.
	await commitPendingCallWrites(worktree, inTree);
	const dirty = await inTree(['status', '--porcelain']);
	if (!dirty.ok || dirty.output.trim().length === 0) {
		return { synced, stop: false, ...(tip === undefined ? {} : { tip }) };
	}
	const lost = await lostCheckout(inTree, dirty.output);
	if (lost !== undefined) {
		return {
			synced: [
				...synced,
				{
					branch,
					outcome: 'failed',
					detail: `${worktree} lost ${String(lost.deleted)} of the ${String(lost.tracked)} files its unit tracks: a lost checkout, not edits, so nothing was committed and the unit's ref keeps its tip; recreate it with \`delendai work enter\``,
				},
			],
			stop: true,
		};
	}
	const committed =
		(await inTree(['add', '-A'])).ok &&
		(
			await inTree([
				'commit',
				'--quiet',
				'-m',
				'chore(wip): keep the uncommitted work found at start',
			])
		).ok;
	if (!committed) {
		return {
			synced: [
				...synced,
				{
					branch,
					outcome: 'failed',
					detail: `${worktree} has uncommitted edits that could not be committed; they are still only on this machine`,
				},
			],
			stop: true,
		};
	}
	synced.push({ branch, outcome: 'kept-uncommitted' });
	return {
		synced,
		stop: false,
		tip: (await inTree(['rev-parse', 'HEAD'])).output.trim(),
	};
};
