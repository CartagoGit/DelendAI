/**
 * review-queue.tool.ts — `review_queue`: the proposals waiting in review,
 * and what each slice needs from a reviewer (x00646).
 *
 * The one call an agent makes when it is asked to review proposals,
 * whatever host it runs in. Read-only; verdicts go through
 * `proposal_review`.
 */
import z from 'zod';

import { toolOk, type IToolRegistration } from '@delendai/core/public';

import { buildReviewQueue } from '../services/review-queue.service';
import { scopeToCaller } from '../services/scope-to-caller.service';
import { createGitRunner } from '../shared/git-runner';
import type { IAuthoringToolOptions } from './authoring-options';

/** Proposals returned in full per call; totals always cover the backlog. */
const DEFAULT_QUEUE_PAGE = 10;
const MAX_QUEUE_PAGE = 50;

export const REVIEW_QUEUE_INPUT_SCHEMA = z.object({
	/** Only this proposal; the whole backlog when absent. */
	proposalId: z.string().min(1).optional(),
	/** Proposals returned in full, oldest first. */
	limit: z.number().int().min(1).max(MAX_QUEUE_PAGE).optional(),
});

const CANDIDATE_SCHEMA = z.object({
	commit: z.string(),
	source: z.string(),
});

const SLICE_SCHEMA = z.object({
	sliceId: z.string(),
	title: z.string(),
	status: z.string(),
	reviewState: z.string(),
	implementer: z.string().optional(),
	implementerSource: z.enum(['round', 'git']).optional(),
	candidates: z.array(CANDIDATE_SCHEMA),
	gate: z.string().optional(),
	files: z.array(z.string()),
	acceptance: z.array(z.string()),
	verdict: z.enum([
		'needs-verdict',
		'blocked',
		'waiting-on-implementer',
		'approved',
	]),
	nextAction: z.string(),
	missing: z.string().optional(),
});

export const REVIEW_QUEUE_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	proposals: z.array(
		z.object({
			id: z.string(),
			file: z.string(),
			date: z.string().optional(),
			slices: z.array(SLICE_SCHEMA),
			close: z.string().optional(),
		}),
	),
	totals: z.object({
		proposals: z.number().int(),
		slices: z.number().int(),
		needsVerdict: z.number().int(),
		blocked: z.number().int(),
		waitingOnImplementer: z.number().int(),
		readyToClose: z.number().int(),
	}),
	procedure: z.string(),
});

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
