import { describe, expect, it } from 'vitest';

import {
	coreFeatureFlag,
	readFeatureFlag,
} from '@delendai/core/lib/plugins/feature-flags';

const ctx = (featureFlags: Record<string, boolean> | undefined) =>
	({
		options: { ...(featureFlags !== undefined ? { featureFlags } : {}) },
	}) as never;

describe('readFeatureFlag (f00152 S5)', () => {
	it('returns false when featureFlags block is absent', () => {
		expect(readFeatureFlag({ options: {} }, 'x.y')).toBe(false);
	});

	it('returns false when featureFlags block is present but key is absent (default-off)', () => {
		expect(
			readFeatureFlag(
				{ options: { featureFlags: { other: true } } },
				'x.y',
			),
		).toBe(false);
	});

	it('returns true when key is explicitly set to true', () => {
		expect(
			readFeatureFlag({ options: { featureFlags: { x: true } } }, 'x'),
		).toBe(true);
	});

	it('returns false when key is explicitly set to false', () => {
		expect(
			readFeatureFlag({ options: { featureFlags: { x: false } } }, 'x'),
		).toBe(false);
	});

	it('ignores non-boolean values silently (default-off fallback)', () => {
		expect(
			readFeatureFlag(
				{ options: { featureFlags: { x: 'true' as never } } },
				'x',
			),
		).toBe(false);
		expect(
			readFeatureFlag(
				{ options: { featureFlags: { x: 1 as never } } },
				'x',
			),
		).toBe(false);
	});

	it('ignores null featureFlags block (default-off)', () => {
		expect(
			readFeatureFlag({ options: { featureFlags: null as never } }, 'x'),
		).toBe(false);
	});
});

describe('coreFeatureFlag (f00152 S5)', () => {
	it('delegates to readFeatureFlag', () => {
		expect(coreFeatureFlag(ctx({ 'x.y': true }), 'x.y')).toBe(true);
		expect(coreFeatureFlag(ctx({ 'x.y': false }), 'x.y')).toBe(false);
		expect(coreFeatureFlag(ctx(undefined), 'x.y')).toBe(false);
	});
});
