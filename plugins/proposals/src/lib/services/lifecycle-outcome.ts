import type {
	ILifecycleEntitySnapshot,
	ILifecycleOutcome,
	ILifecycleOutcomeSummary,
	TLifecycleEntityKind,
} from '../contracts/lifecycle-outcome.contract';

const summary = (
	kind: ILifecycleOutcome['kind'],
	entity: ILifecycleEntitySnapshot,
): ILifecycleOutcomeSummary => ({
	kind,
	entity,
});

export const lifecycleEntity = (input: {
	readonly id: string;
	readonly entity: TLifecycleEntityKind;
	readonly status?: string | undefined;
	readonly path?: string | undefined;
	readonly sliceId?: string | undefined;
}): ILifecycleEntitySnapshot => ({
	id: input.id,
	entity: input.entity,
	...(input.status !== undefined ? { status: input.status } : {}),
	...(input.path !== undefined ? { path: input.path } : {}),
	...(input.sliceId !== undefined ? { sliceId: input.sliceId } : {}),
});

export const closedOutcome = (input: {
	readonly entity: ILifecycleEntitySnapshot;
	readonly from?: string | undefined;
	readonly to?: string | undefined;
	readonly previousOutcome?: ILifecycleOutcome['kind'] | undefined;
}): ILifecycleOutcome => ({
	kind: 'closed',
	entity: input.entity,
	...(input.from !== undefined ? { from: input.from } : {}),
	...(input.to !== undefined ? { to: input.to } : {}),
	...(input.previousOutcome !== undefined
		? { previousOutcome: summary(input.previousOutcome, input.entity) }
		: {}),
});

export const alreadyClosedOutcome = (input: {
	readonly entity: ILifecycleEntitySnapshot;
	readonly reason?: string | undefined;
	readonly currentStatus?: string | undefined;
	readonly previousOutcome?: ILifecycleOutcome['kind'] | undefined;
}): ILifecycleOutcome => ({
	kind: 'already_closed',
	already_closed: true,
	entity: input.entity,
	...(input.reason !== undefined ? { reason: input.reason } : {}),
	...(input.currentStatus !== undefined
		? { currentStatus: input.currentStatus }
		: {}),
	previousOutcome: summary(input.previousOutcome ?? 'closed', input.entity),
});

export const conflictOutcome = (input: {
	readonly entity: ILifecycleEntitySnapshot;
	readonly reason: string;
	readonly code?: string | undefined;
	readonly currentStatus?: string | undefined;
	readonly previousOutcome?: ILifecycleOutcome['kind'] | undefined;
}): ILifecycleOutcome => ({
	kind: 'conflict',
	entity: input.entity,
	reason: input.reason,
	...(input.code !== undefined ? { code: input.code } : {}),
	...(input.currentStatus !== undefined
		? { currentStatus: input.currentStatus }
		: {}),
	...(input.previousOutcome !== undefined
		? { previousOutcome: summary(input.previousOutcome, input.entity) }
		: {}),
});

export const invalidTransitionOutcome = (input: {
	readonly entity: ILifecycleEntitySnapshot;
	readonly reason: string;
	readonly currentStatus?: string | undefined;
	readonly nextHops?: readonly string[] | undefined;
}): ILifecycleOutcome => ({
	kind: 'invalid_transition',
	entity: input.entity,
	reason: input.reason,
	...(input.currentStatus !== undefined
		? { currentStatus: input.currentStatus }
		: {}),
	...(input.nextHops !== undefined ? { nextHops: input.nextHops } : {}),
});

export const unknownOutcome = (input: {
	readonly entity: ILifecycleEntitySnapshot;
	readonly reason: string;
	readonly code?: string | undefined;
}): ILifecycleOutcome => ({
	kind: 'unknown',
	entity: input.entity,
	reason: input.reason,
	...(input.code !== undefined ? { code: input.code } : {}),
});

/**
 * x00529 S1 — lifecycle advancement order.
 *
 * A proposal must exist in exactly one status folder. When a half-applied
 * transition leaves the same id in two folders, "which copy do we believe?"
 * needs a total order over the *forward* lifecycle. Only the four forward
 * states are ranked:
 *
 *   ready < in-progress < review < done
 *
 * `paused`, `blocked` and `retired` are PARKED states, not points on the
 * forward path — a parked copy is deliberately not comparable with a
 * forward one, and callers must fail loudly rather than guess which of
 * the two is "further along".
 */
export const LIFECYCLE_ADVANCEMENT_ORDER = [
	'ready',
	'in-progress',
	'review',
	'done',
] as const;

export type TLifecycleAdvancementStatus =
	(typeof LIFECYCLE_ADVANCEMENT_ORDER)[number];

/**
 * Rank of a status on the forward lifecycle, or `null` when the status is
 * parked (`paused` / `blocked` / `retired`) or simply unknown. `null` means
 * "not comparable" — never "rank 0".
 */
export const lifecycleStatusRank = (
	status: string | undefined | null,
): number | null => {
	if (typeof status !== 'string') return null;
	const index = (LIFECYCLE_ADVANCEMENT_ORDER as readonly string[]).indexOf(
		status.trim(),
	);
	return index === -1 ? null : index;
};

/**
 * Compares two lifecycle statuses on the forward order.
 *
 * Returns `'a'` when `a` is strictly more advanced, `'b'` when `b` is,
 * `'tie'` when both rank the same, and `null` when either side is not
 * comparable (parked or unknown) — the caller must then refuse to pick a
 * winner automatically.
 */
export const compareLifecycleAdvancement = (
	a: string | undefined | null,
	b: string | undefined | null,
): 'a' | 'b' | 'tie' | null => {
	const rankA = lifecycleStatusRank(a);
	const rankB = lifecycleStatusRank(b);
	if (rankA === null || rankB === null) return null;
	if (rankA > rankB) return 'a';
	if (rankB > rankA) return 'b';
	return 'tie';
};
