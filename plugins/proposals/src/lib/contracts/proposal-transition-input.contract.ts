import z from 'zod';

import { VALIDATE_EVIDENCE_SCHEMA } from '@mcp-vertex/core/public';

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
	readonly agent?: string | undefined;
	readonly force?: boolean | undefined;
	readonly validateEvidence?:
		| z.infer<typeof VALIDATE_EVIDENCE_SCHEMA>
		| undefined;
}

export const PROPOSAL_TRANSITION_INPUT_SCHEMA = z
	.object({
		id: z.string().min(1),
		to: z.enum(PROPOSAL_TRANSITION_STATUS_VALUES),
		reason: z.string().min(1),
		agent: z.string().optional(),
		force: z.boolean().optional(),
		validateEvidence: VALIDATE_EVIDENCE_SCHEMA.optional(),
	})
	.strict();
