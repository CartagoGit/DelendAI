import z from 'zod';

/** The date part of an ISO timestamp: `2026-10-11`. */
export const KNOWN_KINDS: ReadonlySet<string> = new Set([
	'feat',
	'breaking',
	'fix',
	'refactor',
	'perf',
	'audit',
	'chore',
	'docs',
	'test',
	'infra',
	'spike',
	'legacy',
	'resume',
	'plan',
]);

const TOOL_ERROR_SCHEMA = z.object({
	reason: z.string(),
	nextAction: z.string().optional(),
	code: z.string().optional(),
	blockerType: z.string().optional(),
	/** a00069 S3 — legal DFA targets from the current status. */
	nextHops: z.array(z.string()).optional(),
});

export const PROPOSAL_TRANSITION_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	/**
	 * Mirrors `error.code` at the top level, which the failure envelope
	 * has always sent (see the `code?: string` field on its own type).
	 * Undeclared here, so the SDK rejected every failure result with
	 * "structured content does not match the tool's output schema: data
	 * must NOT have additional properties" — an illegal transition could
	 * not report itself over the protocol at all.
	 */
	code: z.string().optional(),
	kind: z
		.enum([
			'closed',
			'already_closed',
			'conflict',
			'invalid_transition',
			'quarantined',
			'unknown',
		])
		.optional(),
	already_closed: z.boolean().optional(),
	entity: z
		.object({
			id: z.string(),
			entity: z.enum(['proposal', 'plan', 'slice']),
			status: z.string().optional(),
			path: z.string().optional(),
			sliceId: z.string().optional(),
		})
		.optional(),
	previousOutcome: z
		.object({
			kind: z.enum([
				'closed',
				'already_closed',
				'conflict',
				'invalid_transition',
				'quarantined',
				'unknown',
			]),
			entity: z.object({
				id: z.string(),
				entity: z.enum(['proposal', 'plan', 'slice']),
				status: z.string().optional(),
				path: z.string().optional(),
				sliceId: z.string().optional(),
			}),
		})
		.optional(),
	error: TOOL_ERROR_SCHEMA.optional(),
	id: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	reason: z.string().optional(),
	currentStatus: z.string().optional(),
	nextHops: z.array(z.string()).optional(),
	transitionId: z.string().optional(),
	correlationId: z.string().optional(),
	idempotencyKey: z.string().optional(),
	idempotentReplay: z.boolean().optional(),
	movedFrom: z.string().optional(),
	movedTo: z.string().optional(),
	warning: z.string().optional(),
	/** True when the registry index was regenerated after the move. */
	indexSynced: z.boolean().optional(),
	/** Count of self-referential `**Files**` paths rewritten to the new location. */
	filesRewritten: z.number().optional(),
	/**
	 * x00529 S1 — set when the destination was already occupied by a
	 * stale copy of the SAME id and the transition repaired it, keeping
	 * the copy further along `ready < in-progress < review < done`.
	 */
	duplicateResolved: z.string().optional(),
});

export const LAST_TRANSITION_ID_FIELD = 'last-transition-id';

export const LAST_CORRELATION_ID_FIELD = 'last-correlation-id';

export const LAST_IDEMPOTENCY_KEY_FIELD = 'last-idempotency-key';

export const LAST_TRANSITION_FROM_FIELD = 'last-transition-from';

/** Hex characters of a commit a person can still tell apart. */
export const STALE_HASH_LENGTH = 12;
