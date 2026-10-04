/**
 * unit-reaper.service.ts — a delivered unit's worktree and local branch
 * are reaped, not left for somebody to remember.
 *
 * `work publish` removes the worktree only when the tree is clean at that
 * instant, and `gen:all` or an install between the last commit and the
 * publish leaves it dirty — after which nobody comes back. The verdict
 * says the work is delivered and its owner has gone quiet; what is left
 * is a copy of the repository and a branch inviting development on a
 * stale ref.
 *
 * Nothing real is lost: a worktree holding an edit somebody made is kept
 * and reported with the paths; one holding only regenerable files is not.
 */
import type { IReapedUnit } from './unit-lease.interface';
import { removeUnitCheckout, worktreeOfRef } from './unit-removal.service';
import { hasLocalBranch, readUnitStandings } from './unit-standings.service';
import { inspectWorktree } from './unit-worktree-state.service';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

export const reapDeliveredUnits = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly apply: boolean;
	readonly now?: number | undefined;
}): Promise<readonly IReapedUnit[]> => {
	const { root, policy, apply } = input;
	const standings = await readUnitStandings({
		root,
		policy,
		...(input.now === undefined ? {} : { now: input.now }),
	});
	const reaped: IReapedUnit[] = [];
	for (const unit of standings) {
		if (unit.standing !== 'delivered' || !hasLocalBranch(root, unit.ref))
			continue;
		const worktree = worktreeOfRef(root, unit.ref) ?? null;
		const state =
			worktree === null
				? { edited: [], regenerable: [] }
				: inspectWorktree(worktree);
		const base = {
			ref: unit.ref,
			worktree,
			edited: state.edited,
			regenerable: state.regenerable,
		};
		if (state.edited.length > 0) {
			reaped.push({ ...base, outcome: 'kept' });
			continue;
		}
		if (!apply) {
			reaped.push({ ...base, outcome: 'would-remove' });
			continue;
		}
		const removal = await removeUnitCheckout(root, unit.ref);
		reaped.push({
			...base,
			outcome: removal.deletedBranch ? 'removed' : 'kept',
		});
	}
	return reaped;
};
