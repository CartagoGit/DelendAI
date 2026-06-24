import { describe, expect, it } from 'vitest';

import { validateBudget } from '@mcp-vertex/proposals/lib/proposals/proposal-budget';

describe('validateBudget', async () => {
	it('returns withinBudget:true and empty violations when all values within limits', async () => {
		const result = validateBudget(
			{
				maxInputTokens: 250000,
				maxOutputTokens: 40000,
				maxIterations: 6,
				maxToolCalls: 80,
				maxPremiumCalls: 1,
			},
			{
				inputTokens: 1000,
				outputTokens: 500,
				iterations: 2,
				toolCalls: 10,
				premiumCalls: 0,
			},
		);
		expect(result.withinBudget).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it('returns withinBudget:false with block violation when iterations exceed maxIterations', async () => {
		const result = validateBudget({ maxIterations: 6 }, { iterations: 7 });
		expect(result.withinBudget).toBe(false);
		expect(result.violations).toEqual([
			{
				field: 'maxIterations',
				limit: 6,
				observed: 7,
				severity: 'block',
			},
		]);
	});

	it('returns block violation when premiumCalls exceed maxPremiumCalls', async () => {
		const result = validateBudget(
			{ maxPremiumCalls: 1 },
			{ premiumCalls: 2 },
		);
		expect(result.withinBudget).toBe(false);
		expect(result.violations[0]).toMatchObject({
			field: 'maxPremiumCalls',
			limit: 1,
			observed: 2,
			severity: 'block',
		});
	});

	it('returns warn (not block) violation when inputTokens exceed maxInputTokens', async () => {
		const result = validateBudget(
			{ maxInputTokens: 250000 },
			{ inputTokens: 300000 },
		);
		expect(result.withinBudget).toBe(false);
		expect(result.violations[0]).toMatchObject({
			field: 'maxInputTokens',
			limit: 250000,
			observed: 300000,
			severity: 'warn',
		});
	});

	it('returns warn violation when outputTokens exceed maxOutputTokens', async () => {
		const result = validateBudget(
			{ maxOutputTokens: 40000 },
			{ outputTokens: 50000 },
		);
		expect(result.withinBudget).toBe(false);
		expect(result.violations[0]).toMatchObject({
			field: 'maxOutputTokens',
			severity: 'warn',
		});
	});

	it('returns warn (not block) violation when toolCalls exceed maxToolCalls', async () => {
		const result = validateBudget({ maxToolCalls: 80 }, { toolCalls: 81 });
		expect(result.withinBudget).toBe(false);
		expect(result.violations[0]).toMatchObject({
			field: 'maxToolCalls',
			severity: 'warn',
		});
	});

	it('returns withinBudget:true with empty budget (no enforcement)', async () => {
		const result = validateBudget({}, {});
		expect(result.withinBudget).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it('collects multiple violations in a single call', async () => {
		const result = validateBudget(
			{ maxIterations: 3, maxPremiumCalls: 1 },
			{ iterations: 5, premiumCalls: 3 },
		);
		expect(result.withinBudget).toBe(false);
		expect(result.violations).toHaveLength(2);
		const fields = result.violations.map((v) => v.field);
		expect(fields).toContain('maxIterations');
		expect(fields).toContain('maxPremiumCalls');
	});
});
