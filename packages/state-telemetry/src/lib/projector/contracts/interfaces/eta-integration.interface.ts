import type { IDurationSampleSource } from '../../../eta/duration-history';
import type { IWorkFeatureVector } from '../../../eta/feature-vector';
import type { IWorkProgressSnapshot } from './work-progress.interface';

/** What the ETA engine needs to know about one work item. */
export interface IEtaSubject {
	readonly featureVector: IWorkFeatureVector;
	readonly actorProfile: string;
	readonly taskKind: string;
	/** Time the item has been running so far, ms. */
	readonly observedMs: number;
}

export interface IEtaIntegrationOptions {
	/** Past durations the estimate is computed from. */
	readonly source: IDurationSampleSource;
	/**
	 * Describes a work item to the engine, or `undefined` when nothing
	 * is known about it (the snapshot then reports no history).
	 */
	readonly describe: (
		snapshot: IWorkProgressSnapshot,
	) => IEtaSubject | undefined;
}

export type IEtaReasonLabel = 'computed' | 'insufficient_history';

/** A snapshot plus its estimate; `null` fields mean "show `~?`". */
export interface IWorkProgressSnapshotWithEta extends IWorkProgressSnapshot {
	readonly eta_p50_ms: number | null;
	readonly eta_p80_ms: number | null;
	readonly eta_reason: IEtaReasonLabel;
}

export type IStalledEtaVerdict =
	| 'not-stalled'
	| 'near-completion'
	| 'far-from-done'
	| 'unknown';

export interface IEtaIntegration {
	annotate(snapshot: IWorkProgressSnapshot): IWorkProgressSnapshotWithEta;
}
