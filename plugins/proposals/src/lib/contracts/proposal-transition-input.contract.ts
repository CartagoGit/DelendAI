import z from 'zod';

import {
	VALIDATE_EVIDENCE_SCHEMA,
	callerCheckout,
} from '@delendai/core/public';

import {
	PROPOSAL_STATUSES,
	type IProposalStatus,
} from './constants/proposal-glossary.constant';

const PROPOSAL_TRANSITION_STATUS_VALUES = Object.keys(PROPOSAL_STATUSES) as [
	IProposalStatus,
	...IProposalStatus[],
];

export interface IProposalTransitionArgs {
	readonly id: string;
	readonly to: string;
	readonly reason: string;
	readonly transitionId?: string | undefined;
	readonly correlationId?: string | undefined;
	readonly idempotencyKey?: string | undefined;
	readonly agent?: string | undefined;
	readonly force?: boolean | undefined;
	/**
	 * q00001: when true, `proposal_transition` skips the strict DFA edge
	 * check between `from` and `to`. Used only by `proposals_close_plan`
	 * after a successful preflight, so a verified plan can land directly
	 * on `done` from any of the legal plan-status folders. Public callers
	 * MUST NOT pass this; the wrapper sets it.
	 */
	readonly skipDfaForPlanClosure?: boolean | undefined;
	readonly validateEvidence?:
		| z.infer<typeof VALIDATE_EVIDENCE_SCHEMA>
		| undefined;
	/** Validation evidence scope: slice-local or global integration. */
	readonly validationScope?: ValidationEvidenceScope | undefined;
	/**
	 * x00608: the working tree this move belongs in. An agent working in
	 * its own worktree passes that worktree; omitting it keeps the
	 * server's root, which is where a caller standing in the shared
	 * checkout already is.
	 */
	readonly checkout?: string | undefined;
}

export type ValidationEvidenceScope = 'scoped' | 'global';

export const PROPOSAL_TRANSITION_INPUT_SCHEMA = z
	.object({
		id: z.string().min(1),
		to: z.enum(PROPOSAL_TRANSITION_STATUS_VALUES),
		reason: z.string().min(1),
		transitionId: z.string().min(1).optional(),
		correlationId: z.string().min(1).optional(),
		idempotencyKey: z.string().min(1).optional(),
		agent: z.string().optional(),
		force: z.boolean().optional(),
		skipDfaForPlanClosure: z.boolean().optional(),
		validateEvidence: VALIDATE_EVIDENCE_SCHEMA.optional(),
		validationScope: z.enum(['scoped', 'global']).optional(),
		checkout: callerCheckout.arg.optional(),
	})
	.strict();
