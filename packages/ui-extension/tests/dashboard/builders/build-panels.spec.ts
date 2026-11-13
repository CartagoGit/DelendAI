import { describe, expect, it } from 'vitest';
import { fakePartial } from '@delendai/test-kit';
import type { IDashboardAllModels } from '@delendai/client';
import { dictsByLang } from '@delendai/shared/i18n';
import { buildPanels } from '../../../src/dashboard/builders/build-panels';

const baseModel = (): IDashboardAllModels =>
	fakePartial<IDashboardAllModels>({
		overview: {
			serverName: 'delendai',
			serverVersion: '0.1.0',
			namespacePrefix: 'delendai',
			plugins: [],
			tools: [],
			knowledgeIds: [],
			recommendedNextAction: 'N/A',
			totals: {
				tools: 0,
				plugins: 0,
				proposals: 0,
				calls: 0,
				errors: 0,
				totalMs: 0,
				tokens: 0,
				tokensSaved: 0,
				savingsPercent: 0,
				agents: 0,
			},
		},
		metrics: {
			totals: { calls: 0, errors: 0, totalMs: 0, totalBytes: 0 },
			rows: [],
			sparklines: {},
			collectedAt: '2026-06-21T07:00:00.000Z',
		},
		tokens: {
			tokensUsed: 0,
			tokensSaved: 0,
			savingsPercent: 0,
			topByTokens: [],
			history: [],
		},
		tools: { rows: [], sortBy: 'calls', sortDir: 'desc' },
		plugins: { rows: [] },
		spend: null,
		sessions: { total: 0, byStatus: {}, rows: [] },
		times: {
			totalWallMs: 0,
			slowestTool: { tool: 'some_tool', maxMs: 100 },
			p50Ms: 0,
			p95Ms: 0,
			histogram: [],
		},
		agents: { agents: [], totalActive: 0 },
		memory: { state: 'empty', notes: [], total: 0, offset: 0 },
		health: {
			healthy: true,
			locksActive: 0,
			queue: null,
			orphans: 0,
			orphansThreshold: 'unknown',
			stale: [],
			staleCount: 0,
			agents: [],
			fetchedAt: '2026-06-21T07:00:00.000Z',
		},
	}) as IDashboardAllModels;

describe('buildPanels', () => {
	it('renders all panels', () => {
		const html = buildPanels(
			baseModel(),
			dictsByLang.en,
			'https://delendai.dev',
		);
		expect(html).toContain('panel-overview');
		expect(html).toContain('panel-metrics');
		expect(html).toContain('panel-tokens');
		expect(html).toContain('panel-docs');
	});

	it('falls back to the overview when no docs model is present', () => {
		// A host that never loaded the docs plugin still gets a docs
		// panel, built from what `overview` already knows.
		const { docs: _docs, ...withoutDocs } = baseModel();
		const model = fakePartial<IDashboardAllModels>({
			...withoutDocs,
			overview: {
				...withoutDocs.overview,
				tools: [{ name: 'delendai_overview', plugin: 'core' }],
				knowledgeIds: ['k-001'],
				recommendedNextAction: 'run overview',
			},
		});

		const html = buildPanels(model, dictsByLang.en, 'https://delendai.dev');

		expect(html).toContain('panel-docs');
		expect(html).toContain('k-001');
	});

	it('lists the knowledge entries a docs model carries, with their titles', () => {
		const model = fakePartial<IDashboardAllModels>({
			...baseModel(),
			docs: {
				pluginLoaded: true,
				tools: [],
				knowledge: [
					{ id: 'k-100', title: 'A titled entry' },
					{ id: 'k-101' },
				],
				recommendedNextAction: 'read k-100',
			},
		});

		const html = buildPanels(model, dictsByLang.en, 'https://delendai.dev');

		expect(html).toContain('k-100');
		expect(html).toContain('A titled entry');
		// An entry with no title renders without an empty span rather
		// than with one.
		expect(html).toContain('<code>k-101</code></li>');
	});
});
