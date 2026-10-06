/**
 * review-queue.service.ts — everything a reviewer needs to work through
 * the proposals waiting in review, in one read (x00646).
 *
 * An agent told "review the proposals in review" used to have to find
 * them itself, open each one, work out which slices still needed a
 * verdict, guess which commit delivered each slice, and discover the
 * hard way that a slice with no round could not be reviewed at all. The
 * queue answers all of that from the proposals and from Git, the same
 * way in any project: the delivering commits are found through the
 * project's own ref shape, and every slice comes with the exact call
 * that settles it — or the datum that blocks it.
 *
 * Read-only by construction: it never opens a round, never records a
 * verdict, never moves a file.
 */
import type { IReviewClaimHolder } from '../contracts/interfaces/review-claim-holder.interface';
import { procedureFor } from './review-procedure';
import {
	REVIEW_BATCH_ID,
	REVIEW_UNIT_SLICE,
} from '../contracts/constants/review-claims.constant';
import { packOf } from './review-pack.service';
import { summarizeQueue } from './review-queue-summary.service';
import { orderByDrift } from './review-drift.service';
import { proposalsInReview } from './review-backlog.service';
import { reviewClaims, unitOfRef } from './review-claims.service';
import { pageOfQueue } from './review-queue-page.service';
import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	IReviewBacklogEntry,
	IBuildReviewQueueInput,
	IDeliveryCandidate,
	IReviewQueue,
	IReviewQueueProposal,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';
import { supersedingDelivery } from './review-verdict-evidence';
import { readShippingCommit } from '../swarm/slice-shipping-record';
import { listShippedIn } from './review-attribution';
import {
	citingRecords,
	indexDeliveries,
	readIntegrationHistory,
	unitKey,
	type IIntegrationRecord,
} from './delivery-history.service';
import { settleSlice } from './review-queue-slice.service';

export type {
	IBuildReviewQueueInput,
	IDeliveryCandidate,
	IReviewQueue,
	IReviewQueueProposal,
	IReviewQueueSlice,
} from '../contracts/interfaces/review-queue.interface';

const SLICE_BLOCK_RE =
	/^### (\S+)\s+—\s+(.+)$([\s\S]*?)(?=^### |^## (?!#)|\n*$(?![\s\S]))/gmu;

const readText = async (path: string): Promise<string | undefined> =>
	new SafeWorkspaceReader(dirname(path))
		.readText(basename(path))
		.then((value) => value.content)
		.catch(() => undefined);

const dedupe = (
	candidates: readonly IDeliveryCandidate[],
): readonly IDeliveryCandidate[] => {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = candidate.commit.toLowerCase().slice(0, 7);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const reviewProposal = async (
	input: IBuildReviewQueueInput,
	entry: IReviewBacklogEntry,
	deliveries: ReadonlyMap<string, readonly IDeliveryCandidate[]>,
	history: readonly IIntegrationRecord[],
): Promise<IReviewQueueProposal | undefined> => {
	const markdown = await readText(join(input.proposalsDirAbs, entry.file));
	if (markdown === undefined) return undefined;
	const plan = parseProposalSlicePlan(entry.id, markdown);
	const blocks = new Map<string, { title: string; block: string }>();
	for (const match of markdown.matchAll(SLICE_BLOCK_RE)) {
		blocks.set((match[1] ?? '').toLowerCase(), {
			title: (match[2] ?? '').trim(),
			block: match[3] ?? '',
		});
	}
	const shippedIn = listShippedIn(markdown).map((commit) => ({
		commit,
		source: 'frontmatter shipped-in',
	}));
	const citing = citingRecords(history, entry.id);
	const slices: IReviewQueueSlice[] = [];
	for (const slice of plan?.slices ?? []) {
		const found = blocks.get(slice.sliceId.toLowerCase());
		const block = found?.block ?? '';
		const recorded = readShippingCommit(block);
		const gathered = dedupe([
			...(recorded === undefined
				? []
				: [{ commit: recorded, source: 'slice shipped-in' }]),
			...(deliveries.get(unitKey(entry.id, slice.sliceId)) ?? []),
			...shippedIn,
			...citing,
		]);
		// The approval refuses a commit a later delivery of the same files
		// superseded, and names that one instead: the call the queue hands
		// out cites it first, so a reviewer who follows it is not refused.
		const first = gathered[0]?.commit;
		const newer =
			first === undefined
				? undefined
				: await supersedingDelivery(
						input.run,
						input.integration,
						entry.id,
						slice.files,
						first,
					);
		const candidates =
			newer === undefined
				? gathered
				: dedupe([
						{ commit: newer, source: 'latest delivery' },
						...gathered,
					]);
		slices.push(
			await settleSlice(
				input,
				entry.id,
				{
					sliceId: slice.sliceId,
					title: found?.title ?? slice.title,
					block,
					files: slice.files,
					gate: slice.gate,
					acceptance: slice.acceptanceCriteria,
				},
				candidates,
			),
		);
	}
	const closable =
		slices.length > 0 &&
		slices.every((slice) => slice.verdict === 'approved');
	return {
		id: entry.id,
		file: entry.file,
		...(entry.date === undefined ? {} : { date: entry.date }),
		slices,
		...(closable
			? {
					close: `${input.namespacePrefix}_proposal_transition { id: "${entry.id}", to: "done", reason: "every slice independently approved" } — if it is refused, the refusal names what is missing.`,
				}
			: {}),
	};
};

/** The review backlog, oldest first, each slice with the call that settles it. */
export const buildReviewQueue = async (
	input: IBuildReviewQueueInput,
): Promise<IReviewQueue> => {
	const entries = (await proposalsInReview(input.proposalsDirAbs)).filter(
		(entry) =>
			input.proposalId === undefined ||
			entry.id.toLowerCase() === input.proposalId.toLowerCase(),
	);
	const history = await readIntegrationHistory(input.run, input.integration);
	const claims =
		input.refShape === undefined
			? new Map<string, readonly IReviewClaimHolder[]>()
			: await reviewClaims(input.run, input.refShape, input.integration);
	// Your own claims do not count against you. A unit says who you are
	// exactly; an agent name is shared by every instance of a model, so it
	// is only the fallback when no unit is named (x00739).
	const ownUnit =
		input.unit === undefined || input.refShape === undefined
			? undefined
			: (unitOfRef(input.unit, input.refShape) ?? input.unit);
	const heldByOthers = (id: string): readonly string[] => [
		...new Set(
			(claims.get(id.toLowerCase()) ?? [])
				.filter((holder) =>
					ownUnit !== undefined
						? holder.unit !== ownUnit
						: holder.agent !== input.agent,
				)
				.map((holder) => holder.agent),
		),
	];
	const deliveries =
		input.refShape === undefined
			? new Map<string, readonly IDeliveryCandidate[]>()
			: indexDeliveries(history, input.refShape);
	const reviewed: IReviewQueueProposal[] = [];
	for (const entry of entries) {
		const proposal = await reviewProposal(
			input,
			entry,
			deliveries,
			history,
		);
		if (proposal === undefined) continue;
		const others = heldByOthers(proposal.id);
		reviewed.push(
			others.length > 0
				? { ...proposal, claimedBy: others }
				: {
						...proposal,
						claim: `Claim it before reading, in your review unit (\`work\` tool { action: "enter", kind: "review", proposal: "${REVIEW_BATCH_ID}", slice: "${REVIEW_UNIT_SLICE}", agent }): ${input.namespacePrefix}_review_claim { proposalId: "${proposal.id}", agent: "${input.agent ?? '<you>'}", checkout: "<your unit's worktree>" }, or \`delendai review next\`, which claims for you.`,
					},
		);
	}
	// Largest drift first: those reviews get dearer with every merge (f00640).
	const ordered = await orderByDrift(reviewed, input.run, input.integration);
	const { proposals, page } = pageOfQueue(ordered, input);
	const slices = reviewed.flatMap((proposal) => proposal.slices);
	const count = (verdict: IReviewQueueSlice['verdict']): number =>
		slices.filter((slice) => slice.verdict === verdict).length;
	return {
		proposals,
		page,
		totals: {
			proposals: reviewed.length,
			slices: slices.length,
			needsVerdict: count('needs-verdict'),
			blocked: count('blocked'),
			waitingOnImplementer: count('waiting-on-implementer'),
			readyToClose: reviewed.filter(
				(proposal) => proposal.close !== undefined,
			).length,
			claimedByOthers: reviewed.filter(
				(proposal) => proposal.claimedBy !== undefined,
			).length,
		},
		...(ownUnit === undefined
			? {}
			: { pack: packOf(claims, ownUnit, input.namespacePrefix) }),
		summary: summarizeQueue(reviewed),
		procedure: procedureFor(input.namespacePrefix),
	};
};
