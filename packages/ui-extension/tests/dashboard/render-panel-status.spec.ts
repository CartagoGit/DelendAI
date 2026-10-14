import { describe, expect, it } from 'vitest';

import type { IDashboardAllModels } from '@delendai/client';
import { dictsByLang } from '@delendai/shared/i18n';

import { renderPanelStatus } from '../../src/dashboard/render-panel-status';

const baseOverview = {
	serverName: 'delendai',
	serverVersion: '0.42.0',
	namespacePrefix: 'delendai',
	plugins: [{ name: 'core' }, { name: 'memory' }],
	tools: [{ name: 'delendai_overview', plugin: 'core' }],
	knowledgeIds: ['overview'],
	recommendedNextAction: 'Pick a slice from the Proposals tab.',
	totals: {
		tools: 2,
		plugins: 2,
		proposals: 0,
		calls: 12,
		errors: 0,
		totalMs: 200,
		tokens: 100,
		tokensSaved: 50,
		savingsPercent: 33,
		agents: 1,
	},
};

const fixture: IDashboardAllModels = {
	overview: baseOverview,
	metrics: {
		totals: { calls: 12, errors: 0, totalMs: 200, totalBytes: 0 },
		rows: [],
		sparklines: {},
		collectedAt: '2026-06-21T07:00:00.000Z',
	},
	tokens: {
		tokensUsed: 100,
		tokensSaved: 50,
		savingsPercent: 33,
		topByTokens: [],
		history: [],
	},
	tools: { rows: [], sortBy: 'calls', sortDir: 'desc' },
	plugins: { rows: [] },
	proposals: { total: 0, byStatus: {}, rows: [] },
	kpis: {
		totals: baseOverview.totals,
		tokens: { used: 100, saved: 50, savingsPercent: 33 },
		latency: { totalWallMs: 200, p50Ms: 5, p95Ms: 50 },
		spend: null,
	},
	docs: {
		pluginLoaded: false,
		tools: [],
		knowledge: [],
		recommendedNextAction: '',
	},
	spend: null,
	sessions: { total: 0, byStatus: {}, rows: [] },
	times: {
		totalWallMs: 200,
		slowestTool: { tool: 'delendai_overview', maxMs: 50 },
		p50Ms: 5,
		p95Ms: 50,
		histogram: [],
	},
	agents: { agents: [], totalActive: 0 },
	memory: { notes: [], total: 0, offset: 0 },
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
	workspace: {
		overview: { state: 'ready', data: baseOverview },
		tools: {
			state: 'empty',
			data: { rows: [], sortBy: 'calls', sortDir: 'desc' },
		},
		plugins: { state: 'empty', data: { rows: [] } },
		memory: { state: 'empty', data: { notes: [], total: 0, offset: 0 } },
		proposals: {
			state: 'empty',
			data: { total: 0, byStatus: {}, rows: [] },
		},
		agents: { state: 'empty', data: { agents: [], totalActive: 0 } },
		kpis: {
			state: 'ready',
			data: {
				totals: baseOverview.totals,
				tokens: { used: 100, saved: 50, savingsPercent: 33 },
				latency: { totalWallMs: 200, p50Ms: 5, p95Ms: 50 },
				spend: null,
			},
		},
		health: {
			state: 'ready',
			data: {
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
		},
		docs: {
			state: 'empty',
			data: {
				pluginLoaded: false,
				tools: [],
				knowledge: [],
				recommendedNextAction: '',
			},
		},
	},
	server: {
		name: 'delendai',
		version: '0.42.0',
		fetchedAt: '2026-06-21T07:00:00Z',
	},
};

describe('renderPanelStatus', () => {
	it('renders the panel with server identity, KPIs and activity', () => {
		const html = renderPanelStatus(fixture, dictsByLang.en);
		expect(html).toContain('panel-status');
		expect(html).toContain('delendai');
		expect(html).toContain('0.42.0');
		expect(html).toContain('Pick a slice');
	});

	it('renders the pulse + connection chip', () => {
		const html = renderPanelStatus(fixture, dictsByLang.en);
		expect(html).toContain('delendai-status__pulse');
		expect(html).toContain('delendai-status__chip');
	});

	it('marks the connection as lost when server is unavailable', () => {
		const offline = {
			...fixture,
			overview: { ...baseOverview, serverVersion: 'unavailable' },
		};
		const html = renderPanelStatus(offline, dictsByLang.en);
		expect(html).toContain('data-state="lost"');
	});

	it('shows the idle activity hint when there are no recent agents', () => {
		const html = renderPanelStatus(fixture, dictsByLang.en);
		expect(html).toContain('delendai-status__activity--idle');
	});

	it('renders the savings + error-rate progress rings', () => {
		const html = renderPanelStatus(fixture, dictsByLang.en);
		expect(html).toContain('delendai-status__ring');
		expect(html).toContain('delendai-status__ring-svg');
		expect(html).toMatch(/stroke="var\(--delendai-brand-purple\)"/);
		// The default fixture has zero errors so the error ring stays empty.
		// Assert the ring container is present even if the arc is skipped.
		expect(html).toContain('delendai-status__ring');
	});

	it('renders the full error ring when error rate > 0', () => {
		const html = renderPanelStatus(
			{
				...fixture,
				overview: {
					...fixture.overview,
					totals: {
						...fixture.overview.totals,
						errors: 6,
					},
				},
			},
			dictsByLang.en,
		);
		expect(html).toMatch(/stroke="var\(--delendai-error\)"/);
	});

	it('renders the latency sparkline when samples are available', () => {
		const html = renderPanelStatus(
			{
				...fixture,
				metrics: {
					...fixture.metrics,
					sparklines: {
						delendai_overview: [1, 2, 3, 4, 5, 6, 7, 8],
					},
				},
			},
			dictsByLang.en,
		);
		expect(html).toContain('delendai-status__sparkline');
	});
});
