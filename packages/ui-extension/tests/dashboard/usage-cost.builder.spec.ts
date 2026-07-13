import { describe, expect, it } from 'vitest';
import type {
	ILimitsStatusPayload,
	IUsageReportPayload,
} from '../../src/contracts/interfaces/usage-cost.interface';
import { USAGE_TRACKING_OPT_IN_SNIPPET } from '../../src/contracts/constants/opt-in-snippets.constant';
import { buildUsageCostModel } from '../../src/dashboard/builders/usage-cost.builder';

const groupedReport: IUsageReportPayload = {
	groupBy: 'provider',
	windowDays: 7,
	totals: {
		calls: 30,
		inputTokens: 12_000,
		outputTokens: 8_000,
		totalTokens: 20_000,
		costUsd: 10,
		errors: 1,
		autoBypassed: 2,
	},
	buckets: [
		{
			key: 'claude-code',
			calls: 20,
			inputTokens: 9_000,
			outputTokens: 6_000,
			totalTokens: 15_000,
			costUsd: 7.5,
			errors: 0,
			autoBypassed: 2,
		},
		{
			key: 'codex',
			calls: 10,
			inputTokens: 3_000,
			outputTokens: 2_000,
			totalTokens: 5_000,
			costUsd: 2.5,
			errors: 1,
			autoBypassed: 0,
		},
	],
	expensiveCalls: [
		{
			ts: '2026-07-07T09:00:00.000Z',
			plugin: 'orchestrator-runner',
			tool: 'invoke',
			agent: 'claude-code',
			provider: 'claude-code',
			costUsd: 1.2,
			durationMs: 4200,
			outcome: 'success',
		},
	],
};

const withinLimits: ILimitsStatusPayload = {
	sessionSpendUsd: 4,
	sessionLimitUsd: 20,
	sessionLimitPct: 20,
	monthlySpendUsd: 10,
	monthlyLimitUsd: 50,
	monthlyLimitPct: 20,
	breached: null,
};

describe('buildUsageCostModel', () => {
	it('maps a grouped report + limits into a ready card with share percentages', () => {
		const model = buildUsageCostModel(groupedReport, withinLimits);
		if (model.kind !== 'ready') throw new Error('expected ready model');
		expect(model.groupBy).toBe('provider');
		expect(model.windowDays).toBe(7);
		expect(model.empty).toBe(false);
		expect(model.totals.costUsd).toBe(10);
		expect(model.rows).toHaveLength(2);
		expect(model.rows[0]).toEqual({
			key: 'claude-code',
			calls: 20,
			totalTokens: 15_000,
			costUsd: 7.5,
			errors: 0,
			autoBypassed: 2,
			costSharePct: 75,
		});
		expect(model.rows[1]?.costSharePct).toBe(25);
		expect(model.expensiveCalls).toHaveLength(1);
		expect(model.limitsAvailable).toBe(true);
		expect(model.breached).toBeNull();
	});

	it('keeps session and monthly meters independent — never averaged', () => {
		const breach: ILimitsStatusPayload = {
			sessionSpendUsd: 20,
			sessionLimitUsd: 20,
			sessionLimitPct: 100,
			monthlySpendUsd: 30,
			monthlyLimitUsd: 100,
			monthlyLimitPct: 30,
			breached: 'session',
		};
		const model = buildUsageCostModel(groupedReport, breach);
		if (model.kind !== 'ready') throw new Error('expected ready model');

		expect(model.meters).toHaveLength(2);
		const [session, monthly] = model.meters;
		expect(session).toEqual({
			scope: 'session',
			spendUsd: 20,
			limitUsd: 20,
			pct: 100,
			breached: true,
		});
		expect(monthly).toEqual({
			scope: 'monthly',
			spendUsd: 30,
			limitUsd: 100,
			pct: 30,
			breached: false,
		});
		expect(model.breached).toBe('session');

		// Circuit-breaker semantics: no combined/averaged figure anywhere.
		const averagedSpend = (20 + 30) / 2; // 25
		const averagedPct = (100 + 30) / 2; // 65
		for (const meter of model.meters) {
			expect(meter.spendUsd).not.toBe(averagedSpend);
			expect(meter.pct).not.toBe(averagedPct);
		}
	});

	it('flags an empty log explicitly (plugin loaded, nothing recorded)', () => {
		const model = buildUsageCostModel(
			{
				groupBy: 'plugin',
				windowDays: 7,
				totals: {
					calls: 0,
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					costUsd: 0,
					errors: 0,
					autoBypassed: 0,
				},
				buckets: [],
				expensiveCalls: [],
			},
			undefined,
		);
		if (model.kind !== 'ready') throw new Error('expected ready model');
		expect(model.empty).toBe(true);
		expect(model.rows).toEqual([]);
		// Zero total spend → no invented share percentages.
		expect(model.limitsAvailable).toBe(false);
		expect(model.meters[0]).toEqual({
			scope: 'session',
			spendUsd: 0,
			limitUsd: null,
			pct: null,
			breached: false,
		});
		expect(model.meters[1]?.scope).toBe('monthly');
	});

	it('returns the opt-in model when usage-tracking is absent — never throws', () => {
		expect(() => buildUsageCostModel(undefined)).not.toThrow();
		expect(() => buildUsageCostModel(null, withinLimits)).not.toThrow();

		const model = buildUsageCostModel(undefined);
		expect(model.kind).toBe('plugin-absent');
		if (model.kind !== 'plugin-absent')
			throw new Error('expected plugin-absent model');
		expect(model.plugin).toBe('usage-tracking');
		expect(model.hint).toContain('opt-in');
		expect(model.configSnippet).toBe(USAGE_TRACKING_OPT_IN_SNIPPET);
		expect(model.configSnippet).toContain('--plugins=usage-tracking');
	});

	it('reports null cost share when total spend is zero but calls exist', () => {
		const model = buildUsageCostModel(
			{
				...groupedReport,
				totals: { ...groupedReport.totals, costUsd: 0 },
			},
			withinLimits,
		);
		if (model.kind !== 'ready') throw new Error('expected ready model');
		expect(model.rows.every((row) => row.costSharePct === null)).toBe(true);
		expect(model.empty).toBe(false);
	});
});
