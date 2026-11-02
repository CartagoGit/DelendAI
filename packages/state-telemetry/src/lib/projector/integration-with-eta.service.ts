import { computeEta } from '../eta/eta-engine';
import {
	ETA_REASON_COMPUTED,
	ETA_REASON_INSUFFICIENT_HISTORY,
	NEAR_COMPLETION_SPENT_FRACTION,
} from './contracts/constants/eta-integration.constant';
import type {
	IEtaIntegration,
	IEtaIntegrationOptions,
	IWorkProgressSnapshotWithEta,
	IStalledEtaVerdict,
} from './contracts/interfaces/eta-integration.interface';
import type { IWorkProgressSnapshot } from './contracts/interfaces/work-progress.interface';

const withoutEta = (
	snapshot: IWorkProgressSnapshot,
): IWorkProgressSnapshotWithEta => ({
	...snapshot,
	eta_p50_ms: null,
	eta_p80_ms: null,
	eta_reason: ETA_REASON_INSUFFICIENT_HISTORY,
});

/**
 * Adds the estimate to a snapshot without touching the producer: the
 * projection keeps its shape, and the estimate is computed once, when a
 * snapshot is handed to a reader, never while the projection is rebuilt
 * or reconciled. No model is consulted at any point.
 */
export const createEtaIntegration = (
	options: IEtaIntegrationOptions,
): IEtaIntegration => ({
	annotate: (snapshot) => {
		const subject = options.describe(snapshot);
		if (subject === undefined) return withoutEta(snapshot);
		const result = computeEta(options.source, {
			featureVector: subject.featureVector,
			actorProfile: subject.actorProfile,
			taskKind: subject.taskKind,
			observedMs: subject.observedMs,
		});
		if (result.eta === null) return withoutEta(snapshot);
		return {
			...snapshot,
			eta_p50_ms: result.eta.p50,
			eta_p80_ms: result.eta.p80,
			eta_reason: ETA_REASON_COMPUTED,
		};
	},
});

/**
 * What a stalled item's estimate says about it: a stall late in its
 * p80 budget is a long finish line away from nothing, a stall early in
 * it is a real problem. Without an estimate the answer is `unknown`,
 * never a guess.
 */
export const classifyStalledByEta = (
	snapshot: IWorkProgressSnapshotWithEta,
	observedMs: number,
): IStalledEtaVerdict => {
	if (!snapshot.stalled) return 'not-stalled';
	if (snapshot.eta_p80_ms === null || snapshot.eta_p80_ms <= 0)
		return 'unknown';
	return observedMs / snapshot.eta_p80_ms >= NEAR_COMPLETION_SPENT_FRACTION
		? 'near-completion'
		: 'far-from-done';
};
