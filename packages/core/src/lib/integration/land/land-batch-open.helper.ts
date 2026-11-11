/**
 * land-batch-open.helper.ts — build one batch over the tip and open its
 * pull request, so the whole overlapping group runs ONE CI. Only an actor
 * whose pushes the forge builds may run it: the integrator where it is the
 * batch opener, or the host with the person's own credentials.
 */
import type { ITrainCandidate } from '../decisions/culprit.interface';
import { batchBody, refOf } from './land-batch-record.helper';
import type {
	ILandBatchRecord,
	ILandOpenContext,
	ILandPullRequest,
} from './land.interface';

/** Open the batch of `members`; members that clash inside it go to their authors and the rest are built again, once. */
export const openBatch = async (
	ctx: ILandOpenContext,
	members: readonly ILandPullRequest[],
	why: string,
): Promise<void> => {
	const { deps, tip, note } = ctx;
	const candidates: ITrainCandidate[] = members.map((pr) => ({
		number: pr.number,
		headRef: pr.headRef,
		headSha: pr.headSha,
	}));
	const numbers = candidates.map((c) => c.number);
	const ref = refOf(deps.config.batchPrefix, numbers);
	const built = deps.git.buildBatch({ ref, tip, members: candidates });
	if (built.conflicting.length > 0) {
		for (const n of built.conflicting) {
			const pr = members.find((m) => m.number === n);
			if (pr !== undefined)
				await ctx.needsUpdate(pr, 'it conflicts with another member');
		}
		const rest = members.filter(
			(pr) => !built.conflicting.includes(pr.number),
		);
		if (rest.length > 0) await openBatch(ctx, rest, why);
		return;
	}
	if (built.sha === undefined) {
		note(
			`batch ${numbers.join('+')} not pushed: ${built.failure ?? 'a member conflicts'}`,
		);
		return;
	}
	const record: ILandBatchRecord = {
		tip,
		members: members.map((pr) => ({ number: pr.number, sha: pr.headSha })),
		regenerated: built.regenerated,
	};
	const number = await deps.forge.openPullRequest({
		head: ref,
		title: `chore(queue): batch ${numbers.map((n) => `#${String(n)}`).join(' ')}`,
		body: batchBody(record, new Map()),
	});
	note(`batch #${String(number)} opened for ${numbers.join('+')} (${why})`);
};
