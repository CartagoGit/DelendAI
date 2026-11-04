import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError } from '@delendai/core/public';
import { runProposalTransitionCompat } from './proposal-transition.compat';
import {
	PROPOSAL_TRANSITION_INPUT_SCHEMA,
	type IProposalTransitionArgs,
} from '../contracts/proposal-transition-input.contract';
import type { IProposalTransitionToolOptions } from '../contracts/interfaces/proposal-transition-tool.interface';
import { PROPOSAL_TRANSITION_OUTPUT_SCHEMA } from '../contracts/constants/proposal-transition-schema.constant';
export {
	hasIndependentPeerApproval,
	resolveRecentValidateEvidence,
	diagnoseValidateEvidence,
} from './transition/validate-evidence.tool';
export { PROPOSAL_TRANSITION_OUTPUT_SCHEMA } from '../contracts/constants/proposal-transition-schema.constant';
export { runProposalTransition } from './transition/run-transition.tool';
export type {
	IPeerReviewLogEntry,
	IPeerReviewGateDeps,
	IValidateEvidenceDeps,
	IProposalTransitionToolOptions,
} from '../contracts/interfaces/proposal-transition-tool.interface';

export type { IProposalTransitionArgs } from '../contracts/proposal-transition-input.contract';

// ---------------------------------------------------------------------------
// Tool registration.
// ---------------------------------------------------------------------------

/** Registration for `<prefix>_proposal_transition`. */
export const buildProposalTransitionRegistration = (
	options: IProposalTransitionToolOptions,
): IToolRegistration => ({
	id: 'proposal_transition',
	effects: ['write'],
	writeRoot: 'caller-checkout',
	summary:
		'Move a proposal to a new status; validated, folder+frontmatter kept in sync.',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_transition`,
			{
				outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
				description:
					'Move a proposal to a new status. Validates against the DFA, updates frontmatter + git mv. Requires reason.',
				inputSchema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
			},
			async (args: IProposalTransitionArgs) =>
				runProposalTransitionCompat(args, options).then((result) =>
					result.ok
						? result.payload
						: toolError(
								`invalid input: ${JSON.stringify(result.error.issues)}`,
							),
				),
		);
	},
});
