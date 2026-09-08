/**
 * eta-engine.ts — q00020 F3 S3.
 *
 * Turns the local `duration_history` into an ETA. Purely statistical:
 * a sort, a median and a p80 over durations this project actually
 * observed. No ML, no embeddings, no model call, no network.
 *
 * Resolution order for `(featureVectorHash, actorProfile, taskKind)`:
 *
 *   1. `(featureVectorHash, actorProfile)` — the specific basis. Used
 *      when it has at least `MIN_SAMPLES` (5) samples.
 *      `confidence: 0.9`.
 *   2. `(taskKind, actorProfile)` — the global task-kind aggregate.
 *      Used when the specific basis is short but this one has at least
 *      `MIN_SAMPLES`. `confidence: 0.6`.
 *   3. Neither reaches 5 → `eta: null`, `reason:
 *      'insufficient_history'`. The UI renders `~?` rather than a
 *      number nobody should trust.
 *
 * Percentile definitions live in `eta-aggregation.ts` and are stated
 * there in full. In short: `p50` is the interpolated median (mean of
 * the two central values on an even set) and `p80` is the *inclusive
 * nearest-rank* percentile, so it is always a duration that really
 * happened. `range` is `[p20, p80]` — a 60% band, both endpoints
 * nearest-rank — which is what the UI shows as "~lo–hi".
 *
 * `observedMs` (how long the in-flight slice has already been running)
 * never changes the estimate itself; it only produces the *remaining*
 * projection, floored at 0, because an overrunning slice must report
 * "0 left, and it is late", not a negative ETA.
 */

import {
	medianOrUndefined,
	percentileNearestRank,
} from './eta-aggregation';
import type { IDurationSampleSource } from './duration-history';
import { canonicalHash, type IWorkFeatureVector } from './feature-vector';

/** Minimum samples for a basis to be usable at all. */
export const MIN_SAMPLES = 5;

/** Confidence attached to the `(vector, actor)` basis. */
export const CONFIDENCE_VECTOR_ACTOR = 0.9;

/** Confidence attached to the `(task_kind, actor)` fallback basis. */
export const CONFIDENCE_TASK_KIND = 0.6;

/** Lower edge of the reported range. */
export const RANGE_LOW_QUANTILE = 0.2;

/** Upper edge of the reported range, and the `p80` itself. */
export const RANGE_HIGH_QUANTILE = 0.8;

export type TEtaBasis = 'vector_actor' | 'task_kind' | 'none';

export type TEtaReason = 'computed' | 'insufficient_history';

export interface IEtaEstimate {
	/** Interpolated median of the total duration, ms. */
	readonly p50: number;
	/** Nearest-rank 80th percentile of the total duration, ms. */
	readonly p80: number;
	/** `[p20, p80]`, both nearest-rank, ms. */
	readonly range: readonly [number, number];
	readonly sampleSize: number;
	/** `max(0, p50 - observedMs)`. */
	readonly remainingP50: number;
	/** `max(0, p80 - observedMs)`. */
	readonly remainingP80: number;
}

export interface IEtaResult {
	readonly eta: IEtaEstimate | null;
	readonly reason: TEtaReason;
	readonly basis: TEtaBasis;
	/** 0.9 / 0.6 for a computed ETA, 0 when there is none. */
	readonly confidence: number;
	/**
	 * Samples behind the answer. For `insufficient_history` this is the
	 * larger of the two candidate bases, so callers can tell "almost
	 * enough" from "nothing at all".
	 */
	readonly sampleSize: number;
}

export interface IComputeEtaParams {
	readonly featureVector?: IWorkFeatureVector | undefined;
	readonly featureVectorHash?: string | undefined;
	readonly actorProfile: string;
	readonly taskKind: string;
	/** Elapsed time of the in-flight slice, ms. Defaults to 0. */
	readonly observedMs?: number | undefined;
}

const insufficient = (sampleSize: number): IEtaResult => ({
	eta: null,
	reason: 'insufficient_history',
	basis: 'none',
	confidence: 0,
	sampleSize,
});

/**
 * The statistics, isolated from any lookup. Exported so callers (and
 * the fixture test) can reason about a sample set directly.
 *
 * Returns `null` when the sample is empty; it does NOT enforce
 * `MIN_SAMPLES` — that policy belongs to `computeEta`.
 */
export const estimateFromSamples = (
	samples: readonly number[],
	observedMs = 0
): IEtaEstimate | null => {
	if (samples.length === 0) return null;
	const p50 = medianOrUndefined(samples);
	const p80 = percentileNearestRank(samples, RANGE_HIGH_QUANTILE);
	const p20 = percentileNearestRank(samples, RANGE_LOW_QUANTILE);
	if (p50 === undefined || p80 === undefined || p20 === undefined) {
		return null;
	}
	const elapsed = Number.isFinite(observedMs) && observedMs > 0 ? observedMs : 0;
	return {
		p50,
		p80,
		range: [p20, p80],
		sampleSize: samples.length,
		remainingP50: Math.max(0, p50 - elapsed),
		remainingP80: Math.max(0, p80 - elapsed),
	};
};

const resolveHash = (params: IComputeEtaParams): string | undefined => {
	if (params.featureVectorHash !== undefined) return params.featureVectorHash;
	if (params.featureVector !== undefined)
		return canonicalHash(params.featureVector);
	return undefined;
};

/**
 * A pure function over a sample source. It is deliberately NOT a State
 * Engine producer: `f00510` S5 calls it while building a snapshot, so
 * no ETA arithmetic ever runs inside `rebuild`/`reconcile`.
 */
export const computeEta = (
	source: IDurationSampleSource,
	params: IComputeEtaParams
): IEtaResult => {
	const hash = resolveHash(params);
	const specific =
		hash === undefined
			? []
			: source.samplesForVectorActor(hash, params.actorProfile);
	if (specific.length >= MIN_SAMPLES) {
		const eta = estimateFromSamples(specific, params.observedMs);
		if (eta !== null) {
			return {
				eta,
				reason: 'computed',
				basis: 'vector_actor',
				confidence: CONFIDENCE_VECTOR_ACTOR,
				sampleSize: eta.sampleSize,
			};
		}
	}
	const global = source.samplesForTaskKind(
		params.taskKind,
		params.actorProfile
	);
	if (global.length >= MIN_SAMPLES) {
		const eta = estimateFromSamples(global, params.observedMs);
		if (eta !== null) {
			return {
				eta,
				reason: 'computed',
				basis: 'task_kind',
				confidence: CONFIDENCE_TASK_KIND,
				sampleSize: eta.sampleSize,
			};
		}
	}
	return insufficient(Math.max(specific.length, global.length));
};

/**
 * Thin binding of `computeEta` to one sample source, for callers that
 * hold a store for the life of a session.
 */
export class EtaEngine {
	constructor(private readonly source: IDurationSampleSource) {}

	compute(params: IComputeEtaParams): IEtaResult {
		return computeEta(this.source, params);
	}
}
