/**
 * land-batch-assembly.helper.ts — open the one batch pull request of a
 * group of overlapping ready pull requests. The integrator pushes it, so
 * the forge builds it, and that run is the only one the group gets.
 *
 * Members that clash inside the batch go back to their authors; the rest
 * are built again once, without them.
 */
import type { ITrainCandidate } from '../decisions/culprit.interface';

import { batchBody, refOf } from './land-batch-record.helper';
import type {
	IBatchAssemblyReport,
	ILandBatchRecord,
	ILandDeps,
	ILandPullRequest,
} from './land.interface';

/** Build and open a batch over `tip` for `members`; nothing when it cannot be built. */
export const openBatch = async (input: {
	readonly deps: ILandDeps;
	readonly tip: string;
	readonly members: readonly ILandPullRequest[];
	readonly because: string;
	readonly report: IBatchAssemblyReport;
}): Promise<void> => {
	const { deps, tip, members, because, report } = input;
	const { forge, git, config } = deps;
	// A cross-repository head is never built, pushed or batched.
	const own = members.filter((pr) => pr.crossRepository !== true);
	for (const pr of members.filter((m) => m.crossRepository === true))
		report.why(pr.number, 'a cross-repository head is never batched');
	if (own.length === 0) return;
	const candidates: ITrainCandidate[] = own.map((pr) => ({
		number: pr.number,
		headRef: pr.headRef,
		headSha: pr.headSha,
	}));
	const numbers = candidates.map((c) => c.number);
	const ref = refOf(config.batchPrefix, numbers);
	const built = git.buildBatch({ ref, tip, members: candidates });
	if (built.conflicting.length > 0) {
		for (const n of built.conflicting) {
			const pr = own.find((m) => m.number === n);
			if (pr !== undefined)
				report.needsUpdate(pr, 'it conflicts with another member');
		}
		const rest = own.filter((pr) => !built.conflicting.includes(pr.number));
		if (rest.length > 0)
			await openBatch({ ...input, members: rest, because });
		return;
	}
	if (built.sha === undefined) {
		report.note(
			`batch ${numbers.join('+')} not pushed: ${built.failure ?? 'a member conflicts'}`,
		);
		return;
	}
	const record: ILandBatchRecord = {
		tip,
		members: own.map((pr) => ({ number: pr.number, sha: pr.headSha })),
		regenerated: built.regenerated,
	};
	const number = await forge.openPullRequest({
		head: ref,
		title: `chore(queue): batch ${numbers.map((n) => `#${String(n)}`).join(' ')}`,
		body: batchBody(record, new Map()),
	});
	for (const pr of own)
		report.why(pr.number, `rides batch #${String(number)}`);
	report.note(
		`batch #${String(number)} opened for ${numbers.join('+')} (${because})`,
	);
};
