/**
 * review-queue.tool.ts — `review_queue`: the proposals waiting in review,
 * and what each slice needs from a reviewer (x00646).
 *
 * The one call an agent makes when it is asked to review proposals,
 * whatever host it runs in. Read-only; verdicts go through
 * `proposal_review`.
 */
import { toolOk, type IToolRegistration } from '@delendai/core/public';

import {
	REVIEW_QUEUE_INPUT_SCHEMA,
	REVIEW_QUEUE_OUTPUT_SCHEMA,
} from '../contracts/constants/review-queue-schema.constant';
import { buildReviewQueue } from '../services/review-queue.service';
import { scopeToCaller } from '../services/scope-to-caller.service';
import { createGitRunner } from '../shared/git-runner';
import type { IAuthoringToolOptions } from './authoring-options';

/** Proposals returned in full per call; totals always cover the backlog. */
const DEFAULT_QUEUE_PAGE = 10;

export const buildReviewQueueRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'review_queue',
	summary:
		'The proposals waiting in review, oldest first, with what each slice needs from a reviewer.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_review_queue`,
			{
				description:
					'Start here when asked to review proposals. Lists every proposal in review, oldest first; for each slice: review state, implementer (recorded, or derived from Git), candidate delivering commits, gate, acceptance, and the exact proposal_review call that settles it — or the datum that blocks it. Read-only.',
				inputSchema: REVIEW_QUEUE_INPUT_SCHEMA,
				outputSchema: REVIEW_QUEUE_OUTPUT_SCHEMA,
			},
			async (args: {
				proposalId?: string | undefined;
				limit?: number | undefined;
			}) => {
				const scoped = scopeToCaller(options);
				const queue = await buildReviewQueue({
					namespacePrefix: options.namespacePrefix,
					proposalsDirAbs: scoped.proposalsDirAbs,
					indexPathAbs: scoped.indexPathAbs,
					run: scoped.run ?? createGitRunner(scoped.workspaceRoot),
					integration:
						scoped.developmentPolicy?.branches.integration ??
						'HEAD',
					refShape: scoped.developmentPolicy?.branches,
					proposalId: args.proposalId,
					limit: args.limit ?? DEFAULT_QUEUE_PAGE,
				});
				return toolOk({ ok: true, ...queue });
			},
		);
	},
});
