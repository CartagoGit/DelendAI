import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { DashboardService } from '../../src/lib/services/dashboard.service';
import {
	agentsFixture,
	allResponsesFixture,
	createFakeTransport,
	metricsFixture,
	overviewFixture,
	proposalsFixture,
} from './dashboard.service.fixtures';

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

describe('DashboardService', () => {
	it('getOverviewModel returns totals derived from metrics + proposals', async () => {
		const { service } = makeService();
		const model = await service.getOverviewModel();
		expect(model.serverName).toBe(overviewFixture.server.name);
		expect(model.serverVersion).toBe(overviewFixture.server.version);
		expect(model.plugins).toHaveLength(overviewFixture.plugins.length);
		expect(model.tools).toHaveLength(overviewFixture.tools.length);
		expect(model.knowledgeIds).toEqual(['overview', 'plugins']);
		expect(model.totals.calls).toBe(metricsFixture.totals.calls);
		expect(model.totals.errors).toBe(metricsFixture.totals.errors);
		expect(model.totals.tokens).toBe(Math.ceil(7800 * 0.25));
		expect(model.totals.proposals).toBe(proposalsFixture.proposals.length);
		expect(model.totals.agents).toBe(agentsFixture.agents.length);
	});

	it('getMetricsModel sorts rows by calls desc and computes avgMs', async () => {
		const { service } = makeService();
		const model = await service.getMetricsModel();
		expect(model.rows[0]?.calls).toBeGreaterThanOrEqual(
			model.rows[1]?.calls ?? 0,
		);
		for (const row of model.rows) {
			expect(row.avgMs).toBe(Math.round(row.totalMs / row.calls));
			expect(row.tokens).toBe(Math.ceil(row.totalBytes * 0.25));
		}
		expect(model.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('getTokensModel ranks by tokens and reports savings', async () => {
		const { service } = makeService();
		const model = await service.getTokensModel();
		expect(model.tokensUsed).toBe(Math.ceil(7800 * 0.25));
		expect(model.tokensSaved).toBe(Math.round(model.tokensUsed * 0.18));
		expect(model.savingsPercent).toBe(18);
		expect(model.topByTokens[0]?.tool).toBe('proposals_proposal_board');
	});

	it('requests compact overview for dashboard totals', async () => {
		const { service, calls } = makeService();
		await service.getOverviewModel();
		expect(
			calls.find((c) => c.tool === 'mcp-vertex_overview')?.args,
		).toEqual({
			compact: true,
		});
	});

	it('getToolsModel returns sortable rows', async () => {
		const { service } = makeService();
		const model = await service.getToolsModel();
		expect(model.sortBy).toBe('calls');
		expect(model.sortDir).toBe('desc');
		expect(model.rows.length).toBe(
			Object.keys(metricsFixture.tools).length,
		);
	});

	it('getPluginsModel aggregates by namespace prefix', async () => {
		const { service } = makeService();
		const model = await service.getPluginsModel();
		const proposals = model.rows.find((r) => r.plugin === 'proposals');
		expect(proposals).toBeDefined();
		expect(proposals?.tools).toBe(2);
		expect(proposals?.calls).toBe(
			metricsFixture.tools.proposals_proposal_board.calls +
				metricsFixture.tools.proposals_agent_names.calls,
		);
		const total = model.rows.reduce((s, r) => s + r.tokens, 0);
		expect(total).toBeGreaterThan(0);
		const sumOfShares = model.rows.reduce(
			(s, r) => s + r.tokenSharePercent,
			0,
		);
		// Shares sum to ~100% (allow rounding tolerance).
		expect(sumOfShares).toBeGreaterThanOrEqual(99);
		expect(sumOfShares).toBeLessThanOrEqual(101);
	});

	it('getSessionsModel tallies proposals by status', async () => {
		const { service } = makeService();
		const model = await service.getSessionsModel();
		expect(model.total).toBe(3);
		expect(model.byStatus.in_progress).toBe(1);
		expect(model.byStatus.ready).toBe(1);
		expect(model.byStatus.done).toBe(1);
	});

	it('getTimesModel returns p50/p95/histogram and slowest tool', async () => {
		const { service } = makeService();
		const model = await service.getTimesModel();
		expect(model.slowestTool?.tool).toBe('quality_run_quality');
		expect(model.slowestTool?.maxMs).toBe(1500);
		expect(model.p50Ms).toBeGreaterThan(0);
		expect(model.p95Ms).toBeGreaterThanOrEqual(model.p50Ms);
		const sum = model.histogram.reduce((s, b) => s + b.count, 0);
		expect(sum).toBe(Object.keys(metricsFixture.tools).length);
	});

	it('getAgentsModel returns the agent list', async () => {
		const { service } = makeService();
		const model = await service.getAgentsModel();
		expect(model.totalActive).toBe(2);
		expect(model.agents.map((a) => a.name)).toEqual([
			'implementation_runner',
			'delivery_verifier',
		]);
	});

	it('getAllModels returns all 8 models + server metadata in one call', async () => {
		const { service, calls } = makeService();
		const all = await service.getAllModels();
		expect(all.overview.totals.calls).toBe(metricsFixture.totals.calls);
		expect(all.metrics.rows.length).toBeGreaterThan(0);
		expect(all.tokens.topByTokens.length).toBeGreaterThan(0);
		expect(all.tools.rows.length).toBeGreaterThan(0);
		expect(all.plugins.rows.length).toBeGreaterThan(0);
		expect(all.sessions.total).toBe(3);
		expect(all.times.slowestTool?.tool).toBe('quality_run_quality');
		expect(all.agents.totalActive).toBe(2);
		expect(all.server.name).toBe('mcp-vertex');
		// The four upstream tools were each called exactly once.
		const toolNames = calls.map((c) => c.tool);
		expect(
			toolNames.filter((n) => n === 'mcp-vertex_metrics').length,
		).toBeGreaterThanOrEqual(1);
	});

	it('survives missing proposals/agents tools gracefully', async () => {
		const { transport } = createFakeTransport({
			'mcp-vertex_overview': overviewFixture,
			'mcp-vertex_metrics': metricsFixture,
			// proposals_proposal_board / proposals_agent_names are absent
		});
		const client = McpStdioClient.fromTransport(transport);
		const service = new DashboardService({ client });
		const model = await service.getOverviewModel();
		expect(model.totals.proposals).toBe(0);
		expect(model.totals.agents).toBe(0);
	});

	it('respects injected OverviewService + MetricsService when provided', async () => {
		const { transport, calls } = createFakeTransport({});
		const client = McpStdioClient.fromTransport(transport);
		const overviewService = {
			async getOverview() {
				return overviewFixture;
			},
			async listTools() {
				return [];
			},
		};
		const metricsService = {
			async snapshot() {
				return metricsFixture;
			},
			async *stream() {
				// no-op
			},
		};
		const service = new DashboardService({
			client,
			overview: overviewService as never,
			metrics: metricsService as never,
		});
		const model = await service.getOverviewModel();
		expect(model.serverName).toBe('mcp-vertex');
		// Calls to the transport should be only proposals/agents.
		const names = calls.map((c) => c.tool);
		expect(names).not.toContain('mcp-vertex_overview');
		expect(names).not.toContain('mcp-vertex_metrics');
	});
});
