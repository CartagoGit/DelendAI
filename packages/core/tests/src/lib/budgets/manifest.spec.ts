/**
 * manifest.spec.ts — a plugin's declared value, and its absence, are both results.
 */
import { describe, expect, it } from 'vitest';

import {
	buildValueLookup,
	parsePluginValue,
} from '../../../../src/lib/budgets/manifest';

describe('buildValueLookup', () => {
	const lookup = buildValueLookup([
		{ pluginId: 'valued', value: 5 },
		{ pluginId: 'rejected', value: 2.5 },
		{ pluginId: 'silent', value: undefined },
	]);

	it('resolves a valid value and nothing else, never zero', () => {
		expect(lookup.valueFor('valued')).toBe(5);
		expect(lookup.valueFor('rejected')).toBeUndefined();
		expect(lookup.valueFor('silent')).toBeUndefined();
	});

	it('names every plugin it could not rank, and why', () => {
		expect(lookup.unranked).toEqual([
			{ pluginId: 'rejected', reason: 'value-rejected' },
			{ pluginId: 'silent', reason: 'no-value-declared' },
		]);
	});

	it('keeps the rule: a positive integer or nothing', () => {
		expect(parsePluginValue(1)).toBe(1);
		for (const raw of [0, -1, 1.5, '3', null])
			expect(parsePluginValue(raw)).toBeUndefined();
	});
});
