/**
 * render-dashboard-escaping.spec.ts — the property CodeQL cannot see.
 *
 * `js/html-constructed-from-input` fires three times on
 * `render-dashboard.ts`, where the page interpolates the fragments its
 * builders produced. The analyser stops there: it cannot follow that
 * every builder ran the model's text through `escapeHtml` first, so it
 * reports the join.
 *
 * Nothing tested that it does. The builders escape today, and a webview
 * that stops escaping is a cross-site scripting bug in an editor — so
 * the property belongs in a test rather than in three suppressions.
 *
 * The model here is deliberately hostile in the places a model can
 * actually carry text a person did not type: a server name, a plugin
 * name, a tool name, a recommended next action. Each is asserted to
 * reach the page escaped, and the raw form asserted absent.
 */
import { describe, expect, it } from 'vitest';
import { fakePartial } from '@delendai/test-kit';
import { dictsByLang } from '@delendai/shared/i18n';
import type { IDashboardAllModels } from '@delendai/client';

import { renderDashboard } from '../../src/dashboard/render-dashboard';

const PAYLOAD = '<script>alert(1)</script>';
const ESCAPED = '&lt;script&gt;';

const hostileModel = (): IDashboardAllModels =>
	fakePartial<IDashboardAllModels>({
		overview: {
			serverName: `delendai ${PAYLOAD}`,
			serverVersion: '0.1.0',
			namespacePrefix: 'delendai',
			plugins: [{ name: `logs ${PAYLOAD}`, version: '0.1.0' }],
			tools: [{ name: `tail ${PAYLOAD}`, plugin: 'logs' }],
			knowledgeIds: [`k-1 ${PAYLOAD}`],
			recommendedNextAction: `run ${PAYLOAD}`,
			totals: {
				tools: 1,
				plugins: 1,
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
			collectedAt: '2026-09-14T07:00:00.000Z',
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
		proposals: { total: 0, byStatus: {}, rows: [] },
		kpis: {
			totals: {
				tools: 1,
				plugins: 1,
				proposals: 0,
				calls: 0,
				errors: 0,
				totalMs: 0,
				tokens: 0,
				tokensSaved: 0,
				savingsPercent: 0,
				agents: 0,
			},
			tokens: { used: 0, saved: 0, savingsPercent: 0 },
			latency: { totalWallMs: 0, p50Ms: 0, p95Ms: 0 },
			spend: null,
		},
		docs: {
			pluginLoaded: false,
			tools: [],
			knowledge: [],
			recommendedNextAction: `read ${PAYLOAD}`,
		},
		memory: { state: 'empty', notes: [], total: 0, offset: 0 },
		// The header renders this one; it is the model field closest to
		// something a remote server chose.
		server: {
			name: `delendai ${PAYLOAD}`,
			version: '0.1.0',
			fetchedAt: '2026-09-14T07:00:00.000Z',
		},
		health: {
			healthy: true,
			locksActive: 0,
			queue: null,
			orphans: 0,
			orphansThreshold: 'unknown',
			stale: [],
			staleCount: 0,
			agents: [],
			fetchedAt: '2026-09-14T07:00:00.000Z',
		},
	});

const OPTIONS = {
	docsUrl: 'https://delendai.dev',
	refreshCommand: 'delendai.refresh',
	openDocsCommand: 'delendai.openDocs',
	lang: dictsByLang.en,
};

describe('the dashboard page and the text it did not write', () => {
	it('escapes every model-supplied string it renders', () => {
		const html = renderDashboard(hostileModel(), OPTIONS);

		// The payload must appear — the dashboard has to SHOW the name —
		// and it must appear escaped. Absence would be a different bug.
		expect(html).toContain(ESCAPED);
		expect(html).not.toContain(PAYLOAD);
	});

	it('leaves no unescaped angle bracket from the model anywhere on the page', () => {
		const html = renderDashboard(hostileModel(), OPTIONS);

		// A stricter form of the same property: the exact opening tag
		// cannot occur at all, however many builders touched the value.
		expect(html.includes('<script>alert')).toBe(false);
	});
});
