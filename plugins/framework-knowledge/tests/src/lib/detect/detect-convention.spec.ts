// detect-convention.spec.ts: when counts become a convention, and when
// they do not.

import { describe, expect, it } from 'vitest';

import { detectConvention } from '../../../../src/lib/detect/detect-convention.helper';
import { resolvePolicy } from '../../../../src/lib/policy/resolve-policy.helper';

describe('detectConvention', () => {
	it('names the habit a project clearly has, with its share and sample', () => {
		expect(
			detectConvention([
				{ value: 'external-template', count: 94 },
				{ value: 'inline-template', count: 2 },
			]),
		).toEqual({ value: 'external-template', confidence: 0.98, sample: 96 });
	});

	it('answers none for a sample too small to be a habit', () => {
		expect(
			detectConvention([
				{ value: 'a', count: 3 },
				{ value: 'b', count: 1 },
			]),
		).toBeUndefined();
	});

	it('answers none for a tie at the top', () => {
		expect(
			detectConvention([
				{ value: 'a', count: 6 },
				{ value: 'b', count: 6 },
				{ value: 'c', count: 1 },
			]),
		).toBeUndefined();
	});

	it('answers none when the leader holds too small a share', () => {
		expect(
			detectConvention([
				{ value: 'a', count: 5 },
				{ value: 'b', count: 4 },
				{ value: 'c', count: 3 },
			]),
		).toBeUndefined();
	});

	it('ignores values that never occur, and nothing counted is no convention', () => {
		expect(detectConvention([])).toBeUndefined();
		expect(
			detectConvention([
				{ value: 'a', count: 5 },
				{ value: 'b', count: 0 },
			]),
		).toEqual({ value: 'a', confidence: 1, sample: 5 });
	});

	it('takes the caller thresholds when given', () => {
		expect(
			detectConvention([{ value: 'a', count: 2 }], {
				minimumSample: 1,
				minimumConfidence: 0.5,
			}),
		).toEqual({ value: 'a', confidence: 1, sample: 2 });
	});

	it('feeds the resolver, where it outranks the framework recommendation', () => {
		const detected = detectConvention([
			{ value: 'external-template', count: 94 },
			{ value: 'inline-template', count: 2 },
		]);
		const resolution = resolvePolicy({
			options: [
				{ value: 'external-template', force: 'supported' },
				{ value: 'inline-template', force: 'recommended' },
			],
			detectedConvention: detected,
			frameworkRecommendation: 'inline-template',
			defaultValue: 'inline-template',
		});
		expect(resolution).toMatchObject({
			outcome: 'resolved',
			value: 'external-template',
			source: 'detected-convention',
		});
	});
});
