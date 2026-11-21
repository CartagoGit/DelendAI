/**
 * reviewer-move-guard.service.ts — a reviewer never moves a proposal it
 * judged.
 *
 * A verdict is the move: `request_changes` leaves the proposal in
 * `review/` with its slices' `review-state: changes_requested`, and the
 * last approval closes it. A reviewer that saw its queue unchanged then
 * ran `review → in-progress` by hand on ten proposals, which read them as
 * never delivered. A manual transition by an agent holding a verdict on
 * the proposal is refused, naming what its verdict already did.
 */
import { join } from 'node:path';

import { resolveWorkAgentId } from '@delendai/core/public';

import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import { readTextOrNull } from '../proposals/index-reader';
import { locateProposal } from '../proposals/locate';
import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import { parseReviewState } from '../swarm/proposal-review';
import { isSentBack, sentBackNextAction } from '../swarm/proposal-stage';
import { reviewUnitAgent } from './review-claim.service';

/** A verdict an agent recorded on a slice. */
interface IHeldVerdict {
	readonly sliceId: string;
	readonly verdict: 'approved' | 'requested_changes';
}

/** The slice blocks of `markdown`, each with its id. */
const slicesOf = (
	markdown: string,
): readonly { readonly id: string; readonly block: string }[] =>
	markdown
		.replace(/^---[\s\S]*?---\s*/u, '')
		.split(/^### /mu)
		.slice(1)
		.map((block) => ({ id: block.split(/\s/u)[0] ?? '', block }));

/** The verdicts `agent` recorded on the proposal, the last one per slice. */
export const verdictsHeldBy = (
	markdown: string,
	agent: string,
): readonly IHeldVerdict[] => {
	const who = agent.toLowerCase();
	return slicesOf(markdown).flatMap(({ id, block }) => {
		const last = parseReviewState(block)
			.rounds.filter(
				(round) =>
					round.verdict !== 'resubmitted' &&
					round.agent.toLowerCase() === who,
			)
			.at(-1);
		return last === undefined || last.verdict === 'resubmitted'
			? []
			: [{ sliceId: id, verdict: last.verdict }];
	});
};

/** Whether `agent` delivered any slice of the proposal. */
const implementedBy = (markdown: string, agent: string): boolean =>
	slicesOf(markdown).some(
		({ block }) =>
			parseReviewState(block).implementer?.toLowerCase() ===
			agent.toLowerCase(),
	);

/** What the verdicts already did to the proposal, in one line. */
const whatTheVerdictDid = (proposalId: string, markdown: string): string =>
	isSentBack(markdown)
		? sentBackNextAction(proposalId)
		: `The verdicts are recorded on its slices; the last approval closes ${proposalId} by itself (review → done), and a slice still waiting keeps it in review/.`;

/**
 * The refusal for `reviewer` moving the proposal by hand, or `undefined`
 * when it holds no verdict on it. Outside a review unit, an agent that
 * also delivered a slice of the proposal moves it as its implementer.
 */
export const reviewerMoveRefusal = (input: {
	readonly proposalId: string;
	readonly markdown: string;
	readonly reviewer: string | undefined;
	/** The call runs in the reviewer's own review unit. */
	readonly inReviewUnit: boolean;
	readonly to: string;
}): { readonly reason: string; readonly nextAction: string } | undefined => {
	if (input.reviewer === undefined || input.reviewer.length === 0) {
		return undefined;
	}
	const held = verdictsHeldBy(input.markdown, input.reviewer);
	if (held.length === 0) return undefined;
	if (!input.inReviewUnit && implementedBy(input.markdown, input.reviewer)) {
		return undefined;
	}
	const listed = held
		.map((verdict) => `${verdict.sliceId} ${verdict.verdict}`)
		.join(', ');
	return {
		reason: `${input.reviewer} holds verdicts on ${input.proposalId} (${listed}): a reviewer does not move a proposal it judged, and the move to ${input.to} was not made.`,
		nextAction: whatTheVerdictDid(input.proposalId, input.markdown),
	};
};

/**
 * The refusal for a manual transition of `id` by a reviewer holding a
 * verdict on it, or `undefined`. The reviewer is the agent the call's
 * review unit is named after, else the agent the call names, else the
 * one the environment declares.
 */
export const reviewerMoveRefusalFor = async (input: {
	readonly id: string;
	readonly to: string;
	readonly agent: string | undefined;
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string | undefined;
	readonly shape: IWorkRefShape | undefined;
	readonly run?: IGitRunner | undefined;
}): Promise<
	{ readonly reason: string; readonly nextAction: string } | undefined
> => {
	const run = input.run ?? createGitRunner(input.workspaceRoot);
	const unitAgent = await reviewUnitAgent(run, input.shape);
	const declared = resolveWorkAgentId({
		...(input.agent === undefined ? {} : { model: input.agent }),
		environment: process.env.DELENDAI_AGENT_ID,
	});
	const reviewer =
		unitAgent ?? (declared.source === 'none' ? undefined : declared.id);
	if (reviewer === undefined) return undefined;
	const found = await locateProposal(input.id, {
		indexPathAbs:
			input.indexPathAbs ?? join(input.proposalsDirAbs, 'index.json'),
		proposalsDirAbs: input.proposalsDirAbs,
	});
	if (found === null) return undefined;
	const markdown = await readTextOrNull(found.absPath);
	if (markdown === null) return undefined;
	return reviewerMoveRefusal({
		proposalId: input.id,
		markdown,
		reviewer,
		inReviewUnit: unitAgent !== undefined,
		to: input.to,
	});
};
