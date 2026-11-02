import { describe, expect, it } from 'vitest';

import {
	manifestBudgetDivergence,
	readManifestBudget,
} from './manifest-budget.helper';

const budget = {
	staticBytes: 1_000,
	caps: { hard: 1_200, warning: 1_100 },
	measuredAt: '2026-11-01',
	source: 'token-budget-real',
} as const;

describe('manifestBudgetDivergence', () => {
	it('accepts bytes inside the declared budget', () => {
		expect(manifestBudgetDivergence('a', 1_000, budget)).toBeUndefined();
		expect(manifestBudgetDivergence('a', 500, budget)).toBeUndefined();
	});

	it('names a plugin over its hard cap', () => {
		expect(manifestBudgetDivergence('a', 1_201, budget)).toContain(
			'over its manifest hard cap',
		);
	});

	it('names a budget far above what the plugin lists', () => {
		expect(manifestBudgetDivergence('a', 499, budget)).toContain(
			'far below',
		);
	});
});

describe('readManifestBudget', () => {
	it('reads a real manifest and skips a fixture plugin', async () => {
		expect(
			(await readManifestBudget(process.cwd(), 'git'))?.staticBytes,
		).toBeGreaterThan(0);
		expect(
			await readManifestBudget(process.cwd(), 'tokens-gate'),
		).toBeUndefined();
	});
});
