import { describe, expect, it } from 'vitest';

import {
	acceptanceCap,
	computeConfidence,
	rankVariance,
	uncertaintyOf,
} from './confidence-model.service';

const none = { count: 0, done: 0 };
const full = { count: 5, done: 5 };
const empty = { count: 5, done: 0 };
const alternating = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? 0 : 8));

const scenarios: ReadonlyArray<
	readonly [
		string,
		readonly number[],
		{ count: number; done: number },
		number,
	]
> = [
	['no events', [], full, 0],
	['one event', [3], full, 1],
	['ten coherent events', Array(10).fill(2), full, 1],
	[
		'ten coherent events, no criterion checked',
		Array(10).fill(2),
		empty,
		0.5,
	],
	['ten coherent events, no criteria declared', Array(10).fill(2), none, 1],
	[
		'ten coherent events, 2 of 5 checked',
		Array(10).fill(2),
		{ count: 5, done: 2 },
		0.7,
	],
	['alternating between the extremes', alternating, full, 0],
	[
		'a ramp one phase at a time',
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 8],
		full,
		1 - 7.44 / 16,
	],
	['two ranks only', [4, 4, 4, 4, 4, 5, 5, 5, 5, 5], full, 1 - 0.25 / 16],
	[
		'more done than declared is clamped',
		Array(10).fill(1),
		{ count: 2, done: 9 },
		1,
	],
	[
		'negative done is clamped',
		Array(10).fill(1),
		{ count: 2, done: -3 },
		0.5,
	],
	[
		'only the last ten events count',
		[...Array(50).fill(0), ...Array(10).fill(6)],
		full,
		1,
	],
];

describe('confidence model', () => {
	it.each(scenarios)('%s', (_name, ranks, acceptance, expected) => {
		const confidence = computeConfidence(ranks.slice(-10), acceptance);
		expect(confidence).toBeCloseTo(expected, 6);
		expect(confidence).toBeGreaterThanOrEqual(0);
		expect(confidence).toBeLessThanOrEqual(1);
	});

	it('caps at 0.5 with nothing checked and 1 with everything checked', () => {
		expect(acceptanceCap(empty)).toBe(0.5);
		expect(acceptanceCap(full)).toBe(1);
	});

	it('keeps uncertainty as the exact complement of confidence', () => {
		for (const [, ranks, acceptance] of scenarios) {
			const confidence = computeConfidence(ranks.slice(-10), acceptance);
			expect(uncertaintyOf(confidence)).toBe(1 - confidence);
		}
		expect(uncertaintyOf(computeConfidence([], full))).toBe(1);
	});

	it('computes population variance', () => {
		expect(rankVariance([1, 3])).toBe(1);
		expect(rankVariance([])).toBe(0);
	});
});
