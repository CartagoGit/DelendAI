import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError } from '@delendai/core/public';
import { runProposalTransitionCompat } from './proposal-transition.compat';
import { reviewerMoveRefusalFor } from '../services/reviewer-move-guard.service';
import { scopeToCaller } from '../services/scope-to-caller.service';
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

/**
 * The typed `superseded_by` leads the reason, the form every reader of an
 * old record still parses; a reason that already leads with it is kept.
 */
export const withSupersededReason = (
	args: IProposalTransitionArgs,
): IProposalTransitionArgs => {
	const { superseded_by: by, ...rest } = args;
	if (by === undefined) return args;
	return rest.reason.startsWith(`superseded_by ${by}`)
		? rest
		: { ...rest, reason: `superseded_by ${by}: ${rest.reason}` };
};

/** Registration for `<prefix>_proposal_transition`. */
export const buildProposalTransitionRegistration = (
	options: IProposalTransitionToolOptions,
): IToolRegistration => ({
	id: 'proposal_transition',
	effects: ['write'],
	writeRoot: 'caller-checkout',
	summary: 'Move a proposal to a new status; its folder follows.',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_transition`,
			{
				outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
				description: 'Move a proposal to a new status (DFA-checked).',
				inputSchema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
			},
			async (args: IProposalTransitionArgs) => {
				// A verdict is the move: the reviewer that recorded one does
				// not move the proposal by hand afterwards.
				if (
					args.superseded_by !== undefined &&
					!/^[a-z]\d{5}$/u.test(args.superseded_by)
				)
					return toolError(
						`superseded_by must be a proposal id, got "${args.superseded_by}"`,
					);
				const scoped = scopeToCaller(options);
				const refusal = await reviewerMoveRefusalFor({
					id: args.id,
					to: args.to,
					agent: args.agent,
					workspaceRoot: scoped.workspaceRoot,
					proposalsDirAbs: scoped.proposalsDirAbs,
					indexPathAbs: scoped.indexPathAbs,
					shape: options.workRefShape,
					run: options.gitRunner,
				});
				if (refusal !== undefined) {
					return toolError(refusal.reason, refusal.nextAction);
				}
				return runProposalTransitionCompat(
					withSupersededReason(args),
					options,
				).then((result) =>
					result.ok
						? result.payload
						: toolError(
								`invalid input: ${JSON.stringify(result.error.issues)}`,
							),
				);
			},
		);
	},
});
