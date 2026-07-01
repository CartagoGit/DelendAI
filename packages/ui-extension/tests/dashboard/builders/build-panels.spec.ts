import { describe, expect, it } from 'vitest';
import type { IDashboardAllModels } from '@mcp-vertex/client';
import { dictsByLang } from '@mcp-vertex/shared/i18n';
import { buildPanels } from '../../../src/dashboard/builders/build-panels';

describe('buildPanels', () => {
	it('renders all panels', () => {
		const mockModel = {
			overview: {
				serverName: 'mcp-vertex',
				serverVersion: '0.1.0',
				namespacePrefix: 'mcp-vertex',
				plugins: [],
				tools: [],
				knowledgeIds: [],
				recommendedNextAction: 'N/A',
				totals: { tools: 0, plugins: 0, proposals: 0, calls: 0, errors: 0, totalMs: 0, tokens: 0, tokensSaved: 0, savingsPercent: 0, agents: 0 },
			},
			metrics: { totals: { calls: 0, errors: 0, totalMs: 0, totalBytes: 0 }, rows: [], sparklines: {}, collectedAt: '2026-06-21T07:00:00.000Z' },
			tokens: { tokensUsed: 0, tokensSaved: 0, savingsPercent: 0, topByTokens: [], history: [] },
			tools: { rows: [], sortBy: 'calls', sortDir: 'desc' },
			plugins: { rows: [] },
			sessions: { total: 0, byStatus: {}, rows: [] },
			times: { totalWallMs: 0, slowestTool: { tool: 'some_tool', maxMs: 100 }, p50Ms: 0, p95Ms: 0, histogram: [] },
			agents: { agents: [], totalActive: 0 },
			health: { healthy: true, locksActive: 0, queue: null, orphans: 0, orphansThreshold: 'unknown', stale: [], staleCount: 0, agents: [], fetchedAt: '2026-06-21T07:00:00.000Z' },
		} as unknown as IDashboardAllModels;

		const html = buildPanels(mockModel, dictsByLang.en, 'https://docs.mcp.vertex');
		expect(html).toContain('panel-overview');
		expect(html).toContain('panel-metrics');
		expect(html).toContain('panel-tokens');
		expect(html).toContain('panel-docs');
	});
});
