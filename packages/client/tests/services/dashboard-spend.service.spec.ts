/**
 * dashboard-spend.service.spec.ts — f00118 S1.
 *
 * DashboardService gains REAL spend/cost telemetry sourced from
 * usage-tracking's `usage_report`, joined onto the existing byte-based
 * estimate. Detected via `overview.plugins` (already fetched) — when
 * usage-tracking is not loaded, `spend` is `null` and everything else
 * fills normally (graceful degradation, no thrown errors).
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { DashboardService } from '../../src/lib/services/dashboard.service';
import {
	allResponsesFixture,
	createFakeTransport,
	metricsFixture,
	overviewFixture,
} from './dashboard.service.fixtures';

const usageReportFixture = {
	groupBy: 'provider' as const,
	windowDays: 7,
	totals: {
		calls: 40,
		inputTokens: 12_000,
		outputTokens: 3_000,
		totalTokens: 15_000,
		costUsd: 1.23,
		tokensSaved: 2_700,
		savingsPercent: 18,
		errors: 1,
		autoBypassed: 0,
	},
	buckets: [
		{
			key: 'anthropic',
			calls: 30,
			inputTokens: 9_000,
			outputTokens: 2_000,
			totalTokens: 11_000,
			costUsd: 1.0,
			tokensSaved: 2_000,
			savingsPercent: 18,
			errors: 1,
			autoBypassed: 0,
		},
		{
			key: 'openai',
			calls: 10,
			inputTokens: 3_000,
			outputTokens: 1_000,
			totalTokens: 4_000,
			costUsd: 0.23,
			tokensSaved: 700,
			savingsPercent: 17,
			errors: 0,
			autoBypassed: 0,
		},
	],
	expensiveCalls: [],
};

const overviewWithUsageTracking = {
	...overviewFixture,
	plugins: [
		...overviewFixture.plugins,
		{ name: 'usage-tracking', version: '0.1.0' },
	],
};

const makeService = (
	responses: Parameters<typeof createFakeTransport>[0] = allResponsesFixture,
): {
	service: DashboardService;
	calls: ReturnType<typeof createFakeTransport>['calls'];
} => {
	const { transport, calls } = createFakeTransport(responses);
	const client = McpStdioClient.fromTransport(transport);
	return { service: new DashboardService({ client }), calls };
};

describe('DashboardService — real spend telemetry (f00118 S1)', () => {
	it('spend is null when usage-tracking is not loaded (graceful degradation)', async () => {
		const { service } = makeService();
		const { spend, overview } = await service.getAllModels();
		expect(spend).toBeNull();
		// Everything else still fills.
		expect(overview.totals.calls).toBe(metricsFixture.totals.calls);
	});

	it('joins real cost/savings from usage_report when usage-tracking is loaded', async () => {
		const { service, calls } = makeService({
			...allResponsesFixture,
			delendai_overview: overviewWithUsageTracking,
			'delendai_usage-tracking_usage_report': usageReportFixture,
		});
		const { spend } = await service.getAllModels();
		expect(spend).not.toBeNull();
		expect(spend?.totalCostUsd).toBe(1.23);
		expect(spend?.totalTokensSaved).toBe(2_700);
		expect(spend?.savingsPercent).toBe(18);
		expect(spend?.byProvider).toHaveLength(2);
		expect(spend?.byProvider[0]?.provider).toBe('anthropic');
		expect(spend?.byProvider[0]?.costUsd).toBe(1.0);
		expect(
			calls.some(
				(c) => c.tool === 'delendai_usage-tracking_usage_report',
			),
		).toBe(true);
	});

	it('degrades to null (not a thrown error) when usage_report itself fails', async () => {
		const { transport } = createFakeTransport({
			...allResponsesFixture,
			delendai_overview: overviewWithUsageTracking,
		});
		const failingTransport = {
			...transport,
			async callTool(args: { name: string; arguments?: object }) {
				if (args.name === 'delendai_usage-tracking_usage_report') {
					throw new Error('boom');
				}
				return transport.callTool(args);
			},
		};
		const client = McpStdioClient.fromTransport(failingTransport);
		const service = new DashboardService({ client });
		const { spend } = await service.getAllModels();
		expect(spend).toBeNull();
	});

	it('getSpendModel is available standalone (not only via getAllModels)', async () => {
		const { service } = makeService({
			...allResponsesFixture,
			delendai_overview: overviewWithUsageTracking,
			'delendai_usage-tracking_usage_report': usageReportFixture,
		});
		const spend = await service.getSpendModel();
		expect(spend?.totalCostUsd).toBe(1.23);
	});
});
