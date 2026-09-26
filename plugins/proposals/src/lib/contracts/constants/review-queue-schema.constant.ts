/**
 * review-queue-schema.constant.ts — the input and output of `review_queue`
 * (x00646), kept with the other tool contracts.
 */
import z from 'zod';

/** The most proposals one call returns in full. */
const MAX_QUEUE_PAGE = 50;

export const REVIEW_QUEUE_INPUT_SCHEMA = z.object({
	/** Only this proposal; the whole backlog when absent. */
	proposalId: z.string().min(1).optional(),
	/** Proposals returned in full, oldest first. */
	limit: z.number().int().min(1).max(MAX_QUEUE_PAGE).optional(),
	/** Your agent id: proposals other agents hold are listed last. */
	agent: z.string().min(1).optional(),
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
	implementerSource: z.enum(['round', 'git', 'unrecorded']).optional(),
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
	changedSince: z
		.array(z.object({ commit: z.string(), subject: z.string() }))
		.optional(),
	changedSinceTruncated: z.boolean().optional(),
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
			claimedBy: z.array(z.string()).optional(),
			claim: z.string().optional(),
		}),
	),
	totals: z.object({
		proposals: z.number().int(),
		slices: z.number().int(),
		needsVerdict: z.number().int(),
		blocked: z.number().int(),
		waitingOnImplementer: z.number().int(),
		readyToClose: z.number().int(),
		claimedByOthers: z.number().int(),
	}),
	procedure: z.string(),
});
