/**
 * review-claim.tool.ts — a reviewer takes a proposal, in its own unit
 * (x00737).
 *
 * A claim is a commit in the reviewer's unit carrying the `Claims` trailer
 * `review_queue` reads. Only `git` could make it, so a host with MCP and no
 * terminal could enter a review unit (the `work` tool) and record verdicts
 * (`proposal_review`) but never claim what it was about to read, and two
 * reviewers could read the same proposal. `delendai review next` claims
 * through this tool too, so a claim is made one way.
 */
import {
	toolError,
	toolOk,
	type IToolRegistration,
} from '@delendai/core/public';

import {
	REVIEW_CLAIM_INPUT_SCHEMA,
	REVIEW_CLAIM_OUTPUT_SCHEMA,
} from '../contracts/constants/review-claim-schema.constant';
import {
	claimForReview,
	publishPackStep,
	releaseClaim,
} from '../services/review-claim.service';
import { scopeToCaller } from '../services/scope-to-caller.service';
import { createGitRunner } from '../shared/git-runner';
import type { IAuthoringToolOptions } from './authoring-options';
import type { IReviewClaimOutcome } from '../contracts/interfaces/review-claim-outcome.interface';

type IAnswer = ReturnType<typeof toolOk> | ReturnType<typeof toolError>;

/** What each claim outcome answers: one entry per outcome kind. */
const ANSWERS: {
	readonly [K in IReviewClaimOutcome['kind']]: (
		outcome: Extract<IReviewClaimOutcome, { kind: K }>,
		proposalId: string,
		prefix: string,
	) => IAnswer;
} = {
	held: (outcome, proposalId, prefix) =>
		toolError(
			`${proposalId} is held by another review unit (${outcome.by.join(', ')}).`,
			`Take the next proposal ${prefix}_review_queue offers you.`,
		),
	'pack-full': (outcome, _proposalId, prefix) =>
		toolError(
			`Your review unit already holds a full pack (${String(outcome.size)} proposals).`,
			publishPackStep(prefix),
		),
	failed: (outcome, proposalId) =>
		toolError(
			`Could not claim ${proposalId}: ${outcome.reason}.`,
			'Claim it in your review unit: pass the worktree the `work` tool gave you as `checkout`.',
		),
	'already-claimed': (_outcome, proposalId) =>
		toolOk({ proposalId, claimed: false }),
	claimed: (outcome, proposalId) =>
		toolOk({
			proposalId,
			claimed: true,
			...(outcome.commit === undefined ? {} : { commit: outcome.commit }),
		}),
};

const answerFor = (
	outcome: IReviewClaimOutcome,
	proposalId: string,
	prefix: string,
): IAnswer =>
	(
		ANSWERS[outcome.kind] as (
			outcome: IReviewClaimOutcome,
			proposalId: string,
			prefix: string,
		) => IAnswer
	)(outcome, proposalId, prefix);

export const buildReviewClaimRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'review_claim',
	effects: ['write'],
	writeRoot: 'caller-checkout',
	summary:
		'Take a proposal to review, in your review unit, before reading it.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_review_claim`,
			{
				description:
					'Claim a proposal in your review unit before reading it, so no other reviewer takes it: a commit with the claim `review_queue` reads. Pass your unit’s worktree as `checkout` (the `work` tool gives it). Refused while another reviewer holds the proposal. If you could not inspect or run what you claimed, do not record a verdict: pass `release` with why, and the proposal goes back to the queue.',
				inputSchema: REVIEW_CLAIM_INPUT_SCHEMA,
				outputSchema: REVIEW_CLAIM_OUTPUT_SCHEMA,
			},
			async (args: {
				proposalId: string;
				agent: string;
				release?: string | undefined;
			}) => {
				const scoped = scopeToCaller(options);
				const run = scoped.run ?? createGitRunner(scoped.workspaceRoot);
				const shape = scoped.developmentPolicy?.branches;
				if (args.release !== undefined) {
					const released = await releaseClaim(
						run,
						shape,
						args.proposalId,
						shape?.integration ?? 'HEAD',
						args.release,
					);
					if (released.kind === 'released') {
						return toolOk({
							proposalId: args.proposalId,
							claimed: false,
							released: true,
							...(released.commit === undefined
								? {}
								: { commit: released.commit }),
						});
					}
					return toolError(
						released.kind === 'not-held'
							? `Your review unit does not hold ${args.proposalId}: there is nothing to give back.`
							: `Could not release ${args.proposalId}: ${released.reason}.`,
						'Call this from the review unit that claimed it (pass its worktree as `checkout`).',
					);
				}
				const outcome = await claimForReview(
					run,
					shape,
					args.proposalId,
					shape?.integration ?? 'HEAD',
				);
				return answerFor(
					outcome,
					args.proposalId,
					options.namespacePrefix,
				);
			},
		);
	},
});
