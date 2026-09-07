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