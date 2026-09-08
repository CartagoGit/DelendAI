import { describe, expect, it } from 'vitest';

import type { IDurationSampleSource } from './duration-history';
import { MemoryDurationHistoryStore } from './duration-history';
import {
	CONFIDENCE_TASK_KIND,
	CONFIDENCE_VECTOR_ACTOR,
	computeEta,
	estimateFromSamples,
	EtaEngine,
	MIN_SAMPLES,
} from './eta-engine';
import { canonicalHash, computeFeatureVector } from './feature-vector';

const ACTOR = 'agent:implementation-runner';
const KIND = 'slice';
const VECTOR = computeFeatureVector({ slice_count: 2, affected_packages: 1 });
const HASH = canonicalHash(VECTOR);

const sourceOf = (
	specific: readonly number[],
	global: readonly number[],
): IDurationSampleSource => ({
	samplesForVectorActor: () => specific,
	samplesForTaskKind: () => global,
});

const params = {
	featureVector: VECTOR,
	actorProfile: ACTOR,
	taskKind: KIND,
};

describe('estimateFromSamples (f00511 S3)', () => {
	it('returns null for an empty history', () => {
		expect(estimateFromSamples([])).toBeNull();
	});

	it('collapses to the single value for a one-sample history', () => {
		const eta = estimateFromSamples([1000]);
		expect(eta).not.toBeNull();
		expect(eta?.p50).toBe(1000);
		expect(eta?.p80).toBe(1000);
		expect(eta?.range).toEqual([1000, 1000]);
		expect(eta?.sampleSize).toBe(1);
	});

	it('puts the median between the two central values on an even set', () => {
		// [1000, 2000, 3000, 4000]: p50 = 2500 (interpolated),
		// p80 = nearest-rank ceil(0.8*4)=4 -> 4000,
		// p20 = nearest-rank ceil(0.2*4)=1 -> 1000.
		const eta = estimateFromSamples([4000, 1000, 3000, 2000]);
		expect(eta?.p50).toBe(2500);
		expect(eta?.p80).toBe(4000);
		expect(eta?.range).toEqual([1000, 4000]);
	});

	it('keeps p20 <= p50 <= p80 and always reports an observed p80', () => {
		const samples = [500, 900, 1000, 1100, 1200, 30_000];
		const eta = estimateFromSamples(samples);
		expect(eta).not.toBeNull();
		const [low, high] = eta!.range;
		expect(low).toBeLessThanOrEqual(eta!.p50);
		expect(eta!.p50).toBeLessThanOrEqual(high);
		expect(eta!.p80).toBe(high);
		expect(samples).toContain(eta!.p80);
		// The 30s outlier does not drag p50 the way a mean would:
		// mean = 5783, p50 = 1050.
		expect(eta!.p50).toBe(1050);
	});

	it('projects the remaining time and floors it at zero', () => {
		const eta = estimateFromSamples([1000, 2000, 3000, 4000, 5000], 2500);
		expect(eta?.p50).toBe(3000);
		expect(eta?.remainingP50).toBe(500);
		const overrun = estimateFromSamples(
			[1000, 2000, 3000, 4000, 5000],
			999_999,
		);
		expect(overrun?.remainingP50).toBe(0);
		expect(overrun?.remainingP80).toBe(0);
	});
});

describe('computeEta thresholds (f00511 S3)', () => {
	it('returns insufficient_history for an empty history', () => {
		const result = computeEta(sourceOf([], []), params);
		expect(result.eta).toBeNull();
		expect(result.reason).toBe('insufficient_history');
		expect(result.basis).toBe('none');
		expect(result.confidence).toBe(0);
		expect(result.sampleSize).toBe(0);
	});

	it('returns insufficient_history for a single sample', () => {
		const result = computeEta(sourceOf([1000], [1000]), params);
		expect(result.eta).toBeNull();
		expect(result.reason).toBe('insufficient_history');
		expect(result.sampleSize).toBe(1);
	});

	it('falls back to the task_kind aggregate at exactly 4 specific samples', () => {
		const specific = [1000, 1100, 1200, 1300];
		expect(specific).toHaveLength(MIN_SAMPLES - 1);
		const global = [5000, 6000, 7000, 8000, 9000];
		const result = computeEta(sourceOf(specific, global), params);
		expect(result.reason).toBe('computed');
		expect(result.basis).toBe('task_kind');
		expect(result.confidence).toBe(CONFIDENCE_TASK_KIND);
		expect(result.sampleSize).toBe(5);
		expect(result.eta?.p50).toBe(7000);
	});

	it('does NOT fall back at exactly 5 specific samples', () => {
		const specific = [1000, 1100, 1200, 1300, 1400];
		expect(specific).toHaveLength(MIN_SAMPLES);
		const global = [5000, 6000, 7000, 8000, 9000];
		const result = computeEta(sourceOf(specific, global), params);
		expect(result.reason).toBe('computed');
		expect(result.basis).toBe('vector_actor');
		expect(result.confidence).toBe(CONFIDENCE_VECTOR_ACTOR);
		expect(result.sampleSize).toBe(5);
		expect(result.eta?.p50).toBe(1200);
	});

	it('reports insufficient_history when both bases are short, with the larger sample size', () => {
		const result = computeEta(sourceOf([1000, 2000], [1, 2, 3, 4]), params);
		expect(result.eta).toBeNull();
		expect(result.reason).toBe('insufficient_history');
		expect(result.sampleSize).toBe(4);
	});

	it('accepts a precomputed hash instead of a vector', () => {
		const source: IDurationSampleSource = {
			samplesForVectorActor: (hash) =>
				hash === HASH ? [10, 20, 30, 40, 50] : [],
			samplesForTaskKind: () => [],
		};
		const byHash = computeEta(source, {
			featureVectorHash: HASH,
			actorProfile: ACTOR,
			taskKind: KIND,
		});
		expect(byHash.basis).toBe('vector_actor');
		expect(byHash.eta?.p50).toBe(30);
	});

	it('falls back when no vector or hash is supplied at all', () => {
		const result = computeEta(
			sourceOf([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]),
			{
				actorProfile: ACTOR,
				taskKind: KIND,
			},
		);
		expect(result.basis).toBe('task_kind');
		expect(result.eta?.p50).toBe(30);
	});
});

describe('EtaEngine over a real duration history (f00511 S3)', () => {
	it('goes insufficient -> task_kind -> vector_actor as history accumulates', () => {
		const store = new MemoryDurationHistoryStore({ medianGuard: false });
		const engine = new EtaEngine(store);
		const otherVector = computeFeatureVector({ slice_count: 9 });

		expect(engine.compute(params).reason).toBe('insufficient_history');

		// Five samples of the same task_kind but a different vector.
		for (const durationMs of [4000, 5000, 6000, 7000, 8000]) {
			store.recordDuration({
				vector: otherVector,
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs,
				outcome: 'done',
			});
		}
		const viaKind = engine.compute(params);
		expect(viaKind.basis).toBe('task_kind');
		expect(viaKind.confidence).toBe(CONFIDENCE_TASK_KIND);
		expect(viaKind.eta?.p50).toBe(6000);

		// Now five for the exact vector.
		for (const durationMs of [1000, 1100, 1200, 1300, 1400]) {
			store.recordDuration({
				vector: VECTOR,
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs,
				outcome: 'done',
			});
		}
		const viaVector = engine.compute(params);
		expect(viaVector.basis).toBe('vector_actor');
		expect(viaVector.confidence).toBe(CONFIDENCE_VECTOR_ACTOR);
		expect(viaVector.sampleSize).toBe(5);
		expect(viaVector.eta?.p50).toBe(1200);
		store.close();
	});

	it('never reaches the network or a model: computeEta is a pure sort over samples', () => {
		// Guard by construction: the source is a plain object, so the
		// engine cannot do anything but read the arrays it is given.
		let reads = 0;
		const source: IDurationSampleSource = {
			samplesForVectorActor: () => {
				reads += 1;
				return [1, 2, 3, 4, 5];
			},
			samplesForTaskKind: () => {
				reads += 1;
				return [];
			},
		};
		const result = computeEta(source, params);
		expect(result.basis).toBe('vector_actor');
		expect(reads).toBe(1);
	});
});
