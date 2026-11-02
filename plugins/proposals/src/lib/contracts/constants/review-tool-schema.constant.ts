import z from 'zod';

export const REVIEW_APPROVE_COMMIT_HASH_MIN_LEN = 7;

export const REVIEW_APPROVE_COMMIT_HASH_MAX_LEN = 40;

export const REVIEW_APPROVE_COMMIT_HASH_RE = new RegExp(
	`^[0-9a-f]{${REVIEW_APPROVE_COMMIT_HASH_MIN_LEN},${REVIEW_APPROVE_COMMIT_HASH_MAX_LEN}}$`,
	'i',
);

const ACCEPTANCE_EVIDENCE_SCHEMA = z.object({
	criterion: z.string().trim().min(1),
	evidence: z.string().trim().min(1),
});

export const REVIEW_EVIDENCE_SCHEMA = z
	.object({
		commitHash: z
			.string()
			.regex(
				REVIEW_APPROVE_COMMIT_HASH_RE,
				`evidence.commitHash must be ${REVIEW_APPROVE_COMMIT_HASH_MIN_LEN}-${REVIEW_APPROVE_COMMIT_HASH_MAX_LEN} hex characters`,
			),
		validateExitCode: z
			.number()
			.int()
			.refine((value) => value === 0, {
				message: 'evidence.validateExitCode must be 0',
			}),
		testsPassing: z
			.number()
			.int()
			.min(1, 'evidence.testsPassing must be >= 1'),
		testsTotal: z.number().int().min(1, 'evidence.testsTotal must be >= 1'),
		acceptanceCriteria: z.array(ACCEPTANCE_EVIDENCE_SCHEMA).optional(),
		/** The run the counts come from, as `.cache/delendai/results/logs/test-runs.jsonl` records it. */
		runId: z.string().trim().min(1).optional(),
	})
	.refine((value) => value.testsPassing <= value.testsTotal, {
		message: 'evidence.testsPassing must be <= evidence.testsTotal',
		path: ['testsPassing'],
	});

export const REVIEW_INPUT_SCHEMA = z.object({
	proposalId: z.string(),
	sliceId: z.string(),
	action: z.enum([
		'submit',
		'approve',
		'request_changes',
		'status',
		'attest',
	]),
	agent: z.string().min(1),
	note: z.string().optional(),
	/** `attest` only: who delivered a slice Git cannot name; `note` is the evidence. */
	implementer: z.string().min(1).optional(),
	evidence: REVIEW_EVIDENCE_SCHEMA.optional(),
	/**
	 * The commit that delivered the slice. Needed only when no review
	 * round was ever opened for it: the implementer is then derived from
	 * the pull request that merged this commit, never named by the
	 * reviewer. On approve, `evidence.commitHash` serves the same purpose.
	 */
	commitHash: z.string().optional(),
});

export const REVIEW_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	proposalId: z.string(),
	sliceId: z.string(),
	action: z.string(),
	status: z.enum(['none', 'in_review', 'changes_requested', 'done']),
	implementer: z.string().nullable(),
	reviewer: z.string().nullable(),
	rounds: z.array(
		z.object({
			// `resubmitted` is emitted by S1 when a submit lands on a
			// slice that already had standing approvals: it is the round
			// that voids them, and leaving it out of the schema made a
			// legitimate resubmit fail validation rather than record.
			verdict: z.enum(['requested_changes', 'approved', 'resubmitted']),
			agent: z.string(),
			note: z.string(),
		}),
	),
	lockReleased: z.boolean(),
	assignmentReleased: z.boolean(),
	redactedSecrets: z.number().int().nonnegative(),
	// Present only on approve, so a single-reviewer flow pays
	// nothing for them. `approvalsRemaining` is deliberately absent: it
	// is `quorum - approvalsStanding.length`, and a field that restates
	// two others is output-schema weight for no information.
	quorum: z.number().int().positive().optional(),
	approvalsStanding: z.array(z.string()).optional(),
	quorumMessage: z.string().optional(),
	/** Present when the round was opened from Git for this verdict. */
	attributedTo: z.string().optional(),
	/** The approval ended the proposal and `review → done` ran. */
	proposalClosed: z.boolean().optional(),
	/** Why that transition was refused, when it was. */
	proposalCloseBlocker: z.string().optional(),
	/** A change request sent the proposal back to `in-progress`. */
	proposalReopened: z.boolean().optional(),
	/** The submission left no slice to do and the proposal went to `review`. */
	proposalHandedOver: z.boolean().optional(),
});
