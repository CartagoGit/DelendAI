/**
 * landed-work-ref.ts — what becomes of a work ref whose checkout has
 * nothing of its own, by the work-ref rule.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { workRefFate } from '../work-units/work-ref-lifecycle.service';
import {
	recordWorkRefMove,
	workRefMover,
	workRefMovesPathVia,
} from '../work-units/work-ref-moves.service';
import { workRefOpennessOf } from './proposal-in-progress.helper';
import type { IWorkCheckoutPublication } from './work-checkout-publisher.interface';

const firstField = (output: string): string | undefined =>
	output.trim().split(/\s+/u)[0] || undefined;

/**
 * Settle a work ref whose checkout has nothing of its own: the work-ref
 * rule says whether the forge keeps it, gets it back, or loses it.
 *
 * A unit kept for its proposal goes on after its work lands: its
 * checkout follows the integration branch and has nothing of its own
 * until the next slice. While its proposal is in progress, the remote ref
 * is the unit the forge shows for it, so it stays, and comes back if
 * something took it. Once the proposal has moved on, a ref pointing into
 * the integration branch's history read as a unit somebody left: on
 * 2026-10-10 two of them failed the check the merge queue starts with.
 * Then it is taken off, and the next commit pushes it again.
 */
export const settleLanded = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	remote: string,
	ref: string,
): Promise<IWorkCheckoutPublication> => {
	const listed = await run(['ls-remote', '--', remote, ref]);
	const remoteSha = listed.ok ? firstField(listed.output) : undefined;
	const landed =
		remoteSha === undefined ||
		(
			await run([
				'merge-base',
				'--is-ancestor',
				remoteSha,
				`refs/heads/${policy.branches.integration}`,
			])
		).ok;
	const verdict = workRefFate({
		landed,
		onForge: remoteSha !== undefined,
		...(await workRefOpennessOf(run, policy, ref)),
		worktree: 'in-use',
	});
	const record = async (move: 'restore' | 'withdraw'): Promise<void> => {
		await recordWorkRefMove(
			await workRefMovesPathVia(run),
			ref,
			move,
			workRefMover('checkout-publisher'),
		);
	};
	if (verdict.fate === 'restore') {
		if (
			!(await run(['push', '--quiet', '--', remote, `${ref}:${ref}`])).ok
		) {
			return {
				ref,
				outcome: 'skipped',
				reason: `${remote} refused it back`,
			};
		}
		await record('restore');
		return { ref, outcome: 'published', reason: verdict.reason };
	}
	if (
		verdict.fate !== 'keep' &&
		remoteSha !== undefined &&
		(await run(['push', '--quiet', '--delete', '--', remote, ref])).ok
	) {
		await record('withdraw');
		return {
			ref,
			outcome: 'withdrawn',
			reason: `its work landed; the ref was taken off ${remote}`,
		};
	}
	return { ref, outcome: 'skipped', reason: 'no commits of its own yet' };
};
