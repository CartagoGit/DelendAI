export type TLifecycleOutcomeKind =
	| 'closed'
	| 'already_closed'
	| 'conflict'
	| 'invalid_transition'
	| 'quarantined'
	| 'unknown';

export type TLifecycleEntityKind = 'proposal' | 'plan' | 'slice';

export interface ILifecycleEntitySnapshot {
	readonly id: string;
	readonly entity: TLifecycleEntityKind;
	readonly status?: string | undefined;
	readonly path?: string | undefined;
	readonly sliceId?: string | undefined;
}

export interface ILifecycleOutcomeSummary {
	readonly kind: TLifecycleOutcomeKind;
	readonly entity: ILifecycleEntitySnapshot;
}

interface ILifecycleOutcomeBase {
	readonly entity: ILifecycleEntitySnapshot;
	readonly previousOutcome?: ILifecycleOutcomeSummary | undefined;
	readonly already_closed?: boolean | undefined;
	readonly reason?: string | undefined;
	readonly code?: string | undefined;
	readonly currentStatus?: string | undefined;
	readonly nextHops?: readonly string[] | undefined;
}

export type ILifecycleOutcome =
	| (ILifecycleOutcomeBase & {
			readonly kind: 'closed';
			readonly from?: string | undefined;
			readonly to?: string | undefined;
		})
	| (ILifecycleOutcomeBase & {
			readonly kind: 'already_closed';
			readonly already_closed: true;
		})
	| (ILifecycleOutcomeBase & {
			readonly kind: 'conflict';
		})
	| (ILifecycleOutcomeBase & {
			readonly kind: 'invalid_transition';
		})
	| (ILifecycleOutcomeBase & {
			readonly kind: 'quarantined';
		})
	| (ILifecycleOutcomeBase & {
			readonly kind: 'unknown';
		});