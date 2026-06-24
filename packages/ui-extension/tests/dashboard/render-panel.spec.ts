import { describe, expect, it } from 'vitest';

import type { IDashboardAllModels } from '@mcp-vertex/client';

import { renderDashboard } from '../../src/dashboard/render-dashboard';
import { renderPanelAgents } from '../../src/dashboard/render-panel-agents';
import { renderPanelMetrics } from '../../src/dashboard/render-panel-metrics';
import { renderPanelOverview } from '../../src/dashboard/render-panel-overview';
import { renderPanelPlugins } from '../../src/dashboard/render-panel-plugins';
import { renderPanelSessions } from '../../src/dashboard/render-panel-sessions';
import { renderPanelTimes } from '../../src/dashboard/render-panel-times';
import { renderPanelTokens } from '../../src/dashboard/render-panel-tokens';
import { renderPanelTools } from '../../src/dashboard/render-panel-tools';

const baseOverview = {
	serverName: 'mcp-vertex',
	serverVersion: '0.1.0',
	namespacePrefix: 'mcp-vertex',
	plugins: [{ name: 'proposals', version: '0.1.0' }, { name: 'memory' }],
	tools: [
		{ name: 'mcp-vertex_overview', plugin: 'mcp-vertex' },
		{ name: 'mcp-vertex_metrics', plugin: 'mcp-vertex' },
		{ name: 'proposals_proposal_board', plugin: 'proposals' },
	],
	knowledgeIds: ['overview', 'plugins'],
	recommendedNextAction: 'Call overview first.',
	totals: {
		tools: 3,
		plugins: 2,
		proposals: 1,
		calls: 27,
		errors: 1,
		totalMs: 2160,
		tokens: 1950,
		tokensSaved: 350,
		savingsPercent: 15,
		agents: 1,
	},
};

const baseMetrics = {
	totals: { calls: 27, errors: 1, totalMs: 2160, totalBytes: 7800 },
	rows: [
		{
			tool: 'mcp-vertex_overview',
			plugin: 'mcp-vertex',
			calls: 12,
			errors: 0,
			totalMs: 240,
			maxMs: 60,
			avgMs: 20,
			totalBytes: 2400,
			tokens: 600,
		},
		{
			tool: 'proposals_proposal_board',
			plugin: 'proposals',
			calls: 4,
			errors: 1,
			totalMs: 320,
			maxMs: 200,
			avgMs: 80,
			totalBytes: 3200,
			tokens: 800,
		},
	],
	sparklines: {},
	collectedAt: '2026-06-21T07:00:00.000Z',
};

const baseTokens = {
	tokensUsed: 1950,
	tokensSaved: 350,
	savingsPercent: 18,
	topByTokens: baseMetrics.rows.slice().sort((a, b) => b.tokens - a.tokens),
	history: [],
};

const baseTools = {
	rows: baseMetrics.rows,
	sortBy: 'calls' as const,
	sortDir: 'desc' as const,
};

const basePlugins = {
	rows: [
		{
			plugin: 'proposals',
			tools: 2,
			calls: 4,
			errors: 1,
			avgMs: 80,
			tokens: 800,
			tokenSharePercent: 41,
		},
		{
			plugin: 'mcp-vertex',
			tools: 2,
			calls: 12,
			errors: 0,
			avgMs: 20,
			tokens: 600,
			tokenSharePercent: 31,
		},
	],
};

const baseSessions = {
	total: 2,
	byStatus: { in_progress: 1, ready: 1 },
	rows: [
		{
			id: 'f00022',
			title: 'IDE extension v2',
			status: 'in_progress',
			track: 'apps+client+docs',
		},
		{
			id: 'f00028',
			title: 'Plugin depth extension',
			status: 'ready',
			track: 'plugins',
		},
	],
};

const baseTimes = {
	totalWallMs: 2160,
	slowestTool: { tool: 'proposals_proposal_board', maxMs: 200 },
	p50Ms: 20,
	p95Ms: 200,
	histogram: [
		{ bucket: '<10ms', count: 0 },
		{ bucket: '10–50ms', count: 1 },
		{ bucket: '50–200ms', count: 1 },
		{ bucket: '200ms–1s', count: 0 },
		{ bucket: '≥1s', count: 0 },
	],
};

const baseAgents = {
	agents: [{ name: 'implementation_runner' }],
	totalActive: 1,
};

const baseHealth = {
	healthy: true,
	locksActive: 0,
	queue: null,
	orphans: 0,
	orphansThreshold: 'unknown',
	stale: [],
	staleCount: 0,
	agents: [],
	fetchedAt: '2026-06-21T07:00:00.000Z',
};

const fixture: IDashboardAllModels = {
	overview: baseOverview,
	metrics: baseMetrics,
	tokens: baseTokens,
	tools: baseTools,
	plugins: basePlugins,
	sessions: baseSessions,
	times: baseTimes,
	agents: baseAgents,
	health: baseHealth,
	server: {
		name: 'mcp-vertex',
		version: '0.1.0',
		fetchedAt: '2026-06-21T07:00:00Z',
	},
};

const opts = {
	docsUrl: 'https://mcp-vertex.dev',
	refreshCommand: 'mcp-vertex.refresh',
	openDocsCommand: 'mcp-vertex.openDocs',
};

describe('renderPanelOverview', async () => {
	it('renders the server name, version, and recommended next action', async () => {
		const html = renderPanelOverview(baseOverview);
		expect(html).toContain('mcp-vertex');
		expect(html).toContain('v0.1.0');
		expect(html).toContain('Call overview first.');
		expect(html).toContain('panel-overview');
	});

	it('escapes user-provided strings (no XSS via plugin name)', async () => {
		const evil = {
			...baseOverview,
			plugins: [{ name: '<script>alert(1)</script>' }],
		};
		const html = renderPanelOverview(evil);
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});
});

describe('renderPanelMetrics', async () => {
	it('renders totals and the top-tools table', async () => {
		const html = renderPanelMetrics(baseMetrics);
		expect(html).toContain('panel-metrics');
		expect(html).toContain('Total calls');
		expect(html).toContain('27');
		expect(html).toContain('mcp-vertex_overview');
	});
});

describe('renderPanelTokens', async () => {
	it('renders the savings percent and the top-tools table', async () => {
		const html = renderPanelTokens(baseTokens);
		expect(html).toContain('panel-tokens');
		expect(html).toContain('18%');
		expect(html).toContain('Tokens used');
	});
});

describe('renderPanelTools', async () => {
	it('renders a sortable table with data-* attributes for client-side sort', async () => {
		const html = renderPanelTools(baseTools);
		expect(html).toContain('mv-tools-table');
		expect(html).toContain('data-calls="12"');
		expect(html).toContain('data-calls="4"');
	});
});

describe('renderPanelPlugins', async () => {
	it('renders the barchart and the rollup table', async () => {
		const html = renderPanelPlugins(basePlugins);
		expect(html).toContain('panel-plugins');
		expect(html).toContain('<svg');
		expect(html).toContain('Token share by plugin');
	});
});

describe('renderPanelSessions', async () => {
	it('groups proposals by status with a pill per row', async () => {
		const html = renderPanelSessions(baseSessions);
		expect(html).toContain('panel-sessions');
		expect(html).toContain('in_progress');
		expect(html).toContain('ready');
		expect(html).toContain('data-status="in_progress"');
	});
});

describe('renderPanelTimes', async () => {
	it('renders total wall, p50/p95, and the histogram', async () => {
		const html = renderPanelTimes(baseTimes);
		expect(html).toContain('panel-times');
		expect(html).toContain('Total wall');
		expect(html).toContain('p50 latency');
		expect(html).toContain('Slowest tool');
		expect(html).toContain('proposals_proposal_board');
	});
});

describe('renderPanelAgents', async () => {
	it('renders one row per active agent', async () => {
		const html = renderPanelAgents(baseAgents);
		expect(html).toContain('panel-agents');
		expect(html).toContain('implementation_runner');
	});

	it('shows the empty-state row when no agents', async () => {
		const html = renderPanelAgents({ agents: [], totalActive: 0 });
		expect(html).toContain('No active agents.');
	});
});

describe('renderDashboard', async () => {
	it('composes header, KPI strip, 8 tabs + 8 panels + Docs + footer', async () => {
		const html = renderDashboard(fixture, opts);
		expect(html).toMatch(/<header class="mv-header">/);
		expect(html).toContain('mv-kpis');
		expect(html).toContain('mv-tabs');
		expect(html).toContain('tab-overview');
		expect(html).toContain('tab-metrics');
		expect(html).toContain('tab-tokens');
		expect(html).toContain('tab-tools');
		expect(html).toContain('tab-plugins');
		expect(html).toContain('tab-sessions');
		expect(html).toContain('tab-times');
		expect(html).toContain('tab-agents');
		expect(html).toContain('tab-health');
		expect(html).toContain('panel-health');
		expect(html).toContain('tab-docs');
		expect(html).toContain('panel-overview');
		expect(html).toContain('panel-metrics');
		expect(html).toContain('panel-docs');
		expect(html).toContain('mv-footer');
		expect(html).toContain('https://mcp-vertex.dev');
	});

	it('inlines the brand logo SVG in the header (via shared --mv-brand-* tokens)', async () => {
		const html = renderDashboard(fixture, opts);
		expect(html).toContain('mv-header__logo');
		expect(html).toContain('linearGradient');
		// f00047 S3: brand hex literals moved to apps/shared; the webview
		// references them via CSS variables so there is exactly one source
		// of truth. Asserting the variable names keeps the test honest.
		expect(html).toContain('--mv-brand-blue');
		expect(html).toContain('--mv-brand-purple');
	});

	it('sets the first tab as active by default', async () => {
		const html = renderDashboard(fixture, opts);
		expect(html).toContain('aria-selected="true"');
		expect(html).toContain('data-active="true"');
	});

	it('escapes the docsUrl to prevent injection', async () => {
		const evil = renderDashboard(fixture, {
			...opts,
			docsUrl: 'https://x.com/"><script>alert(1)</script>',
		});
		expect(evil).not.toContain('<script>alert(1)</script>');
	});

	it('embeds the tab-switching client script', async () => {
		const html = renderDashboard(fixture, opts);
		expect(html).toContain('<script>');
		expect(html).toContain("querySelectorAll('.mv-tab')");
	});
});
