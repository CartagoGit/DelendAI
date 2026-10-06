import { changedSinceFields } from './review-changed-since.service';
import type {
	IBuildReviewQueueInput,
	IDeliveryCandidate,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';
import { parseReviewState } from '../swarm/proposal-review';
import { isRetiredSlice } from './proposal-completeness';
import {
	attributeDelivery,
	type IReviewAttribution,
} from './review-attribution';

const STATUS_LINE_RE = /^[-*]\s*(?:\*\*Status\*\*|status):\s*(.+)$/imu;

const reviewCall = (
	prefix: string,
	proposalId: string,
	sliceId: string,
	implementer: string | undefined,
	commit: string | undefined,
): string => {
	const who =
		implementer === undefined ? '<you>' : `<you — not ${implementer}>`;
	const hash = commit ?? '<delivering commit>';
	return (
		`Read the diff of ${hash}, run the slice gate and check every acceptance item; do not edit code. ` +
		`Then ${prefix}_proposal_review { proposalId: "${proposalId}", sliceId: "${sliceId}", action: "approve", agent: "${who}", note: "<what you verified and how>", evidence: { commitHash: "${hash}", validateExitCode: 0, testsPassing: <n>, testsTotal: <n> } } ` +
		`— or action: "request_changes", commitHash: "${hash}", note: "<what is wrong, where, how to reproduce, what must hold to approve>".`
	);
};

export const settleSlice = async (
	input: IBuildReviewQueueInput,
	proposalId: string,
	slice: {
		readonly sliceId: string;
		readonly title: string;
		readonly block: string;
		readonly files: readonly string[];
		readonly gate?: string | undefined;
		readonly acceptance: readonly string[];
	},
	candidates: readonly IDeliveryCandidate[],
): Promise<IReviewQueueSlice> => {
	const state = parseReviewState(slice.block);
	const later = await changedSinceFields(
		input,
		candidates[0]?.commit,
		slice.files,
	);
	const base = {
		sliceId: slice.sliceId,
		title: slice.title,
		status: STATUS_LINE_RE.exec(slice.block)?.[1]?.trim() ?? 'pending',
		reviewState: state.status,
		candidates,
		files: slice.files,
		acceptance: slice.acceptance,
		...(slice.gate === undefined ? {} : { gate: slice.gate }),
		...later,
	};
	const prefix = input.namespacePrefix;
	// A slice given up on purpose delivered nothing to judge. It has no
	// round, so Git was asked who delivered it, and the queue sent a
	// reviewer to approve work that was never meant to land.
	if (isRetiredSlice(base.status.split(/\s/u)[0] ?? '')) {
		return {
			...base,
			verdict: 'approved',
			nextAction:
				'Retired: nothing was delivered, so there is nothing to review.',
		};
	}
	if (state.status === 'done') {
		return {
			...base,
			...(state.implementer === null
				? {}
				: {
						implementer: state.implementer,
						implementerSource: 'round',
					}),
			verdict: 'approved',
			nextAction: 'Nothing left for a reviewer on this slice.',
		};
	}
	if (state.status === 'changes_requested') {
		return {
			...base,
			...(state.implementer === null
				? {}
				: {
						implementer: state.implementer,
						implementerSource: 'round',
					}),
			verdict: 'waiting-on-implementer',
			nextAction:
				'Changes were requested; the implementer resubmits the fix, then a reviewer other than the last one verifies it.',
		};
	}
	if (state.status === 'in_review' && state.implementer !== null) {
		return {
			...base,
			implementer: state.implementer,
			implementerSource: 'round',
			verdict: 'needs-verdict',
			nextAction: reviewCall(
				prefix,
				proposalId,
				slice.sliceId,
				state.implementer,
				candidates[0]?.commit,
			),
		};
	}
	// No round was ever opened: the implementer has to come from Git.
	// A candidate that names its author wins over one nobody signed; an
	// unsigned delivery still gets a verdict, under the unrecorded name.
	// When no candidate is this slice's at all, report the most telling
	// failure.
	const rank = { unrelated: 1, unusable: 0 } as const;
	let best: { rank: number; missing: string } = {
		rank: -1,
		missing: `the commit that delivered ${proposalId} ${slice.sliceId}: record it on the slice as \`- shipped-in: <sha>\`, or name it as commitHash in the verdict`,
	};
	let unsigned: IReviewAttribution | undefined;
	for (const candidate of candidates) {
		const derived = await attributeDelivery({
			run: input.run,
			proposalId,
			declaredFiles: slice.files,
			commitHash: candidate.commit,
			integration: input.integration,
			refShape: input.refShape,
		});
		if (derived.ok && derived.attribution.recorded) {
			return attributed(
				base,
				prefix,
				proposalId,
				slice.sliceId,
				derived.attribution,
			);
		}
		if (derived.ok) unsigned ??= derived.attribution;
		else if (rank[derived.kind] > best.rank) {
			best = { rank: rank[derived.kind], missing: derived.missing };
		}
	}
	if (unsigned !== undefined) {
		return attributed(base, prefix, proposalId, slice.sliceId, unsigned);
	}
	const missing = best.missing;
	return {
		...base,
		verdict: 'blocked',
		missing,
		nextAction: `No approval can be recorded yet: supply ${missing}. If the work was never delivered, send it back with ${prefix}_proposal_review { proposalId: "${proposalId}", sliceId: "${slice.sliceId}", action: "request_changes", agent: "<you>", note: "<what is missing>" } — no commit is needed for that. Do not submit on the implementer's behalf.`,
	};
};

/** A slice whose delivery Git attributed — to a name, or to nobody. */
const attributed = (
	base: Omit<IReviewQueueSlice, 'verdict' | 'nextAction'>,
	prefix: string,
	proposalId: string,
	sliceId: string,
	attribution: IReviewAttribution,
): IReviewQueueSlice => ({
	...base,
	implementer: attribution.implementer,
	implementerSource: attribution.recorded ? 'git' : 'unrecorded',
	verdict: 'needs-verdict',
	nextAction: `${
		attribution.recorded
			? ''
			: 'Nothing in Git names who delivered this; it is reviewed as unrecorded and independence cannot be verified. '
	}${reviewCall(
		prefix,
		proposalId,
		sliceId,
		attribution.recorded ? attribution.implementer : undefined,
		attribution.commit,
	)}`,
});
