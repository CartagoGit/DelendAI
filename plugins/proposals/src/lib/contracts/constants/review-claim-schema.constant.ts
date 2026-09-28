import z from 'zod';

/** `review_claim`: the proposal a reviewer takes, in its own unit. */
export const REVIEW_CLAIM_INPUT_SCHEMA = z.object({
	proposalId: z.string().min(1),
	/** The reviewer, as its unit names it. */
	agent: z.string().min(1),
});

export const REVIEW_CLAIM_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	proposalId: z.string(),
	/** False when this unit had already claimed it. */
	claimed: z.boolean(),
	commit: z.string().optional(),
});
