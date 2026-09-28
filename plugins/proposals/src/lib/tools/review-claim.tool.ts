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
} from '../services/review-claim.service';
import { scopeToCaller } from '../services/scope-to-caller.service';
import { createGitRunner } from '../shared/git-runner';
import type { IAuthoringToolOptions } from './authoring-options';

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
					'Claim a proposal in your review unit before reading it, so no other reviewer takes it: a commit with the claim `review_queue` reads. Pass your unit’s worktree as `checkout` (the `work` tool gives it). Refused while another reviewer holds the proposal.',
				inputSchema: REVIEW_CLAIM_INPUT_SCHEMA,
				outputSchema: REVIEW_CLAIM_OUTPUT_SCHEMA,
			},
			async (args: { proposalId: string; agent: string }) => {
				const scoped = scopeToCaller(options);
				const run = scoped.run ?? createGitRunner(scoped.workspaceRoot);
				const shape = scoped.developmentPolicy?.branches;
				const outcome = await claimForReview(
					run,
					shape,
					args.proposalId,
					shape?.integration ?? 'HEAD',
				);
				switch (outcome.kind) {
					case 'held':
						return toolError(
							`${args.proposalId} is held by another review unit (${outcome.by.join(', ')}).`,
							`Take the next proposal ${options.namespacePrefix}_review_queue offers you.`,
						);
					case 'pack-full':
						return toolError(
							`Your review unit already holds a full pack (${String(outcome.size)} proposals).`,
							publishPackStep(options.namespacePrefix),
						);
					case 'failed':
						return toolError(
							`Could not claim ${args.proposalId}: ${outcome.reason}.`,
							'Claim it in your review unit: pass the worktree the `work` tool gave you as `checkout`.',
						);
					case 'already-claimed':
						return toolOk({
							proposalId: args.proposalId,
							claimed: false,
						});
					case 'claimed':
						return toolOk({
							proposalId: args.proposalId,
							claimed: true,
							...(outcome.commit === undefined
								? {}
								: { commit: outcome.commit }),
						});
				}
			},
		);
	},
});
