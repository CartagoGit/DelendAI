/**
 * review-verdict-lifecycle.ts — what a review verdict does to the
 * proposal it ends (x00643).
 *
 * The last approval used to rewrite the frontmatter to `done` and leave
 * the file in `review/`, then log an "auto-transition repair" for
 * somebody else to finish. A change request left the proposal in
 * `review/` while its slice was open work again. Both now run the one
 * transition every other caller uses, so the folder, the frontmatter
 * and the index move together and under the same gates.
 *
 * A refused close does not undo the approval: the verdict is a fact
 * about the code, the close is a separate step, and its refusal is
 * returned for the reviewer to read.
 */
import type { IReviewVerdictLifecycle } from '../contracts/interfaces/review-verdict-lifecycle.interface';

import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from './proposal-transition.tool';

export type { IReviewVerdictLifecycle } from '../contracts/interfaces/review-verdict-lifecycle.interface';

/** Whether a transition's tool result is a refusal. */
const refused = (result: object): boolean =>
	'isError' in result && result.isError === true;

/** The refusal a transition answered with, as one readable line. */
const refusalOf = (result: {
	readonly structuredContent?: unknown;
	readonly content?: readonly { readonly text?: string }[];
}): string => {
	// Two envelope shapes are in use: `{ error: { reason } }` and
	// `{ error: "<code>", reason }`.
	const structured = result.structuredContent as
		| {
				readonly error?: { readonly reason?: unknown } | string;
				readonly reason?: unknown;
		  }
		| undefined;
	const nested =
		typeof structured?.error === 'object'
			? structured.error.reason
			: undefined;
	const reason = nested ?? structured?.reason;
	if (typeof reason === 'string' && reason.length > 0) return reason;
	return result.content?.[0]?.text ?? 'the transition was refused';
};

export const moveProposalAfterVerdict = async (input: {
	readonly close: boolean;
	readonly reopen: boolean;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly agent: string;
	readonly options: IProposalTransitionToolOptions;
}): Promise<IReviewVerdictLifecycle> => {
	if (input.close) {
		const result = await runProposalTransition(
			{
				id: input.proposalId,
				to: 'done',
				reason: `independent review approved the last open slice (${input.sliceId})`,
				agent: input.agent,
			},
			input.options,
		);
		return refused(result)
			? { proposalClosed: false, proposalCloseBlocker: refusalOf(result) }
			: { proposalClosed: true };
	}
	if (input.reopen) {
		const result = await runProposalTransition(
			{
				id: input.proposalId,
				to: 'in-progress',
				reason: `review requested changes to ${input.sliceId}`,
				agent: input.agent,
			},
			input.options,
		);
		return refused(result)
			? {
					proposalReopened: false,
					proposalCloseBlocker: refusalOf(result),
				}
			: { proposalReopened: true };
	}
	return {};
};
