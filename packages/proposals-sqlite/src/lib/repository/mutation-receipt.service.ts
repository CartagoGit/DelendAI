/**
 * mutation-receipt.ts — the one implementation of what a mutation
 * receipt decides, for every repository that carries one.
 *
 * WHY: `plans-repo`, `slices-repo` and `proposals-repo` each contained
 * the same fifteen-plus lines — claim the command, answer a conflict,
 * replay a recorded response, and complete the command on the way out.
 * Three copies, three test suites, one behaviour.
 *
 * The cost of that is not duplication for its own sake. Idempotency is
 * the property that decides whether a retried write creates a second
 * row, and a fix applied to one copy does not reach the other two — so
 * the suites stay green while the live path runs the copy the fix never
 * touched. `lint:no-duplicate-implementation` had been reporting all
 * three pairs.
 *
 * Kept as free functions over a claim rather than a base class: the
 * three repositories differ in what they mutate and agree only about
 * the receipt, and inheritance would have tied together the halves that
 * legitimately differ.
 */

import type {
	IReceiptClaim,
	IReceiptGate,
} from './mutation-receipt.service.interface';

export type {
	IReceiptClaim,
	IReceiptGate,
} from './mutation-receipt.service.interface';

/**
 * What the receipt decides BEFORE the mutation runs.
 *
 * The two settled cases are deliberately different answers rather than
 * one "already handled": a conflict means somebody reused an
 * idempotency key for a DIFFERENT request and must be told, while a
 * replay means the identical request already succeeded and must get
 * the identical answer back. Collapsing them would turn a caller's
 * mistake into a silent success.
 */
export const receiptGate = <TOutcome>(input: {
	readonly claim: IReceiptClaim;
	readonly idempotencyKey: string | undefined;
	/** Builds the conflict outcome in the caller's own outcome union. */
	readonly onConflict: (reason: string) => TOutcome;
}): IReceiptGate<TOutcome> => {
	const claim = input.claim;
	if (claim?.kind === 'conflict') {
		return {
			kind: 'settled',
			outcome: input.onConflict(
				`idempotency key ${input.idempotencyKey ?? ''} was already used with a different request`,
			),
		};
	}
	if (claim?.kind === 'replayed' && claim.command.responseJson) {
		return {
			kind: 'settled',
			outcome: JSON.parse(claim.command.responseJson) as TOutcome,
		};
	}
	return { kind: 'proceed' };
};

/**
 * Record the answer against the receipt, if there is one to record.
 *
 * Only a claim this call STARTED may be completed: completing a
 * replayed one would overwrite the recorded answer with a second
 * computation of it, and completing a conflicted one would give a
 * rejected request a receipt.
 */
export const completeReceipt = <TOutcome>(input: {
	readonly claim: IReceiptClaim;
	readonly outcome: TOutcome & { readonly kind: string };
	readonly revisionAfter: number;
	readonly now: number;
	readonly complete: (args: {
		readonly id: number;
		readonly revisionAfter: number;
		readonly outcomeKind: string;
		readonly responseJson: string;
		readonly now: number;
	}) => void;
}): void => {
	const claim = input.claim;
	if (claim?.kind !== 'started') return;
	input.complete({
		id: claim.command.id,
		revisionAfter: input.revisionAfter,
		outcomeKind: input.outcome.kind,
		responseJson: JSON.stringify(input.outcome),
		now: input.now,
	});
};
