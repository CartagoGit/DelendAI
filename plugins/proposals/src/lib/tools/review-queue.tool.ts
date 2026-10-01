/**
 * review-queue.tool.ts — `review_queue`: the proposals waiting in review,
 * and what each slice needs from a reviewer (x00646).
 *
 * The one call an agent makes when it is asked to review proposals,
 * whatever host it runs in. Read-only; verdicts go through
 * `proposal_review`.
 */
import { fnv1a, toolOk, type IToolRegistration } from '@delendai/core/public';

import {
	REVIEW_QUEUE_INPUT_SCHEMA,
	REVIEW_QUEUE_OUTPUT_SCHEMA,
} from '../contracts/constants/review-queue-schema.constant';
import { compactQueue } from '../services/review-queue-view.service';
import { buildReviewQueue } from '../services/review-queue.service';
import { scopeToCaller } from '../services/scope-to-caller.service';
import { createGitRunner } from '../shared/git-runner';
import type { IAuthoringToolOptions } from './authoring-options';

/** Proposals returned in full per call; totals always cover the backlog. */
const DEFAULT_QUEUE_PAGE = 10;

/**
 * Where this server's reviewer starts among the free proposals: stable for
 * the life of the process, different between the processes a swarm runs.
 */
/** `fnv1a` answers in hexadecimal. */
const HEX_RADIX = 16;

const spreadFor = (agent: string | undefined): number =>
	Number.parseInt(fnv1a(`${String(process.pid)}:${agent ?? ''}`), HEX_RADIX);

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
				offset?: number | undefined;
				agent?: string | undefined;
				unit?: string | undefined;
				detail?: boolean | undefined;
			}) => {
				const scoped = scopeToCaller(options);
				const queue = await buildReviewQueue({
					namespacePrefix: options.namespacePrefix,
					proposalsDirAbs: scoped.proposalsDirAbs,
					run: scoped.run ?? createGitRunner(scoped.workspaceRoot),
					integration:
						scoped.developmentPolicy?.branches.integration ??
						'HEAD',
					refShape: scoped.developmentPolicy?.branches,
					proposalId: args.proposalId,
					limit: args.limit ?? DEFAULT_QUEUE_PAGE,
					offset: args.offset,
					agent: args.agent,
					unit: args.unit,
					// A reviewer that names itself is one of a swarm; one that
					// does not reads the backlog oldest first.
					...(args.agent === undefined
						? {}
						: { spread: spreadFor(args.agent) }),
				});
				// The list by default; the evidence for the one proposal asked
				// for, or when asked for explicitly.
				const view =
					args.proposalId !== undefined || args.detail === true
						? queue
						: compactQueue(queue);
				return toolOk({ ok: true, ...view });
			},
		);
	},
});
