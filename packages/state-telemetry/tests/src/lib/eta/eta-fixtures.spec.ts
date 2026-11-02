/**
 * eta-fixtures.spec.ts — f00511 S3 accuracy fixture.
 *
 * Builds a synthetic but realistic `duration_history` (a deterministic
 * seeded PRNG, log-normal noise around a per-vector "true" duration),
 * then checks that the p50 the engine reports is within the accuracy
 * budget the proposal asks for: the MEDIAN relative error of p50 over
 * the dataset must be <= 35%.
 *
 * Deterministic on purpose — a flaky statistical test is worse than no
 * test. The seed is fixed and the PRNG is a plain LCG.
 */

import { describe, expect, it } from 'vitest';

import {
	MemoryDurationHistoryStore,
	type IDurationHistoryStore,
} from '../../../../src/lib/eta/duration-history';
import { computeEta, MIN_SAMPLES } from '../../../../src/lib/eta/eta-engine';
import { medianOrUndefined } from '../../../../src/lib/eta/eta-aggregation';
import {
	computeFeatureVector,
	type IWorkFeatureVector,
} from '../../../../src/lib/eta/feature-vector';

const ACTOR = 'agent:implementation-runner';
const KIND = 'slice';

/** Deterministic LCG (Numerical Recipes constants). */
const makeRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
		return state / 0x1_0000_0000;
	};
};

/** Box-Muller on top of the LCG. */
const makeGaussian =
	(random: () => number): (() => number) =>
	() => {
		const u1 = Math.max(random(), Number.EPSILON);
		const u2 = random();
		return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
	};

const SIGMA = 0.3;

interface ICase {
	readonly vector: IWorkFeatureVector;
	readonly trueMedianMs: number;
}

const buildCases = (count: number, random: () => number): ICase[] =>
	Array.from({ length: count }, (_unused, index) => ({
		vector: computeFeatureVector({
			slice_count: 1 + (index % 4),
			affected_packages: index % 3,
			public_api_changes: index % 2,
			test_count: index % 5,
			loc_changed: 100 * (1 + (index % 7)),
		}),
		// "Truth": cost grows with the complexity proxy, plus jitter.
		trueMedianMs: Math.round(
			60_000 + 40_000 * (1 + (index % 4)) + 5_000 * random(),
		),
	}));

const populate = (
	store: IDurationHistoryStore,
	cases: readonly ICase[],
	samplesPerCase: number,
	gaussian: () => number,
): void => {
	for (const testCase of cases) {
		for (let index = 0; index < samplesPerCase; index += 1) {
			store.recordDuration({
				vector: testCase.vector,
				actorProfile: ACTOR,
				taskKind: KIND,
				durationMs: Math.round(
					testCase.trueMedianMs * Math.exp(SIGMA * gaussian()),
				),
				outcome: 'done',
			});
		}
	}
};

describe('ETA accuracy over a synthetic fixture (f00511 S3)', () => {
	it('keeps the median relative error of p50 at or below 35% on >= 50 samples', () => {
		const random = makeRandom(20_260_906);
		const gaussian = makeGaussian(random);
		const store = new MemoryDurationHistoryStore({ medianGuard: false });
		const cases = buildCases(10, random);
		populate(store, cases, 7, gaussian);
		expect(store.count()).toBe(70);
		expect(store.count()).toBeGreaterThanOrEqual(50);

		const errors: number[] = [];
		for (const testCase of cases) {
			const result = computeEta(store, {
				featureVector: testCase.vector,
				actorProfile: ACTOR,
				taskKind: KIND,
			});
			expect(result.reason).toBe('computed');
			expect(result.basis).toBe('vector_actor');
			expect(result.sampleSize).toBeGreaterThanOrEqual(MIN_SAMPLES);
			const p50 = result.eta?.p50 ?? 0;
			errors.push(
				Math.abs(p50 - testCase.trueMedianMs) / testCase.trueMedianMs,
			);
		}

		const medianError = medianOrUndefined(errors) ?? 1;
		expect(medianError).toBeLessThanOrEqual(0.35);
		store.close();
	});

	it('brackets the truth inside [p20, p80] for most cases', () => {
		const random = makeRandom(777);
		const gaussian = makeGaussian(random);
		const store = new MemoryDurationHistoryStore({ medianGuard: false });
		const cases = buildCases(12, random);
		populate(store, cases, 9, gaussian);

		let bracketed = 0;
		for (const testCase of cases) {
			const result = computeEta(store, {
				featureVector: testCase.vector,
				actorProfile: ACTOR,
				taskKind: KIND,
			});
			const range = result.eta?.range;
			if (range === undefined) continue;
			if (
				testCase.trueMedianMs >= range[0] &&
				testCase.trueMedianMs <= range[1]
			) {
				bracketed += 1;
			}
		}
		expect(bracketed / cases.length).toBeGreaterThanOrEqual(0.6);
		store.close();
	});
});
