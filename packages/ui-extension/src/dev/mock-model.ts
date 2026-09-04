/**
 * `packages/ui-extension/dev/mock-model.ts` — shared mock `IDashboardAllModels`
 * consumed by every UI-extension dev entry (the `:5100` ide preview on
 * `tools/scripts/dev/dev.script.ts`, and the `:5200` vscode webviews preview
 * that wants the same dashboard rendering).
 *
 * Why a separate file? The dashboard mock is ~290 lines and used to live
 * inside `packages/ui-extension/src/dev/entry.ts`. The :5200 entry needs the
 * same data to render `renderDashboard` against, so both entries now share
 * this single source. Edit the mock here, not in either entry.
 *
 * The model deliberately exercises every panel the dashboard renders
 * (overview / metrics / tokens / tools / plugins / sessions / times / agents /
 * health / server). If a future panel is added, fill its slot here so the dev
 * preview still renders it end-to-end.
 *
 * Pure data — no host imports, no DOM. Safe to import from any browser
 * bundle.
 */
import type { IDashboardAllModels } from '@delendai/client';

export const mockDashboardModel: IDashboardAllModels = {
	overview: {
		serverName: 'mcp-vertex',
		serverVersion: '0.42.0',
		namespacePrefix: 'mcp-vertex',
		recommendedNextAction: 'Pick a slice from the Proposals tab.',
		plugins: [
			{ name: 'core', version: '0.42.0' },
			{ name: 'memory', version: '0.9.1' },
			{ name: 'proposals', version: '1.2.0' },
		],
		tools: [
			{ name: 'mcp-vertex_overview', plugin: 'core' },
			{ name: 'mcp-vertex_search', plugin: 'search' },
			{ name: 'mcp-vertex_proposals_board', plugin: 'proposals' },
			{ name: 'mcp-vertex_memory_recall', plugin: 'memory' },
		],
		knowledgeIds: ['p001-overview', 'p002-arch', 'p003-styleguide'],
		totals: {
			tools: 47,
			plugins: 9,
			proposals: 23,
			calls: 1284,
			errors: 4,
			totalMs: 38_211,
			tokens: 1_842_331,
			tokensSaved: 412_900,
			savingsPercent: 22,
			agents: 3,
		},
	},
	metrics: {
		totals: { calls: 1284, errors: 4, totalMs: 38_211, totalBytes: 0 },
		rows: [
			{
				tool: 'mcp-vertex_overview',
				plugin: 'core',
				calls: 412,
				errors: 2,
				totalMs: 7_416,
				maxMs: 80,
				avgMs: 18,
				totalBytes: 0,
				tokens: 0,
			},
			{
				tool: 'mcp-vertex_search',
				plugin: 'search',
				calls: 318,
				errors: 1,
				totalMs: 14_910,
				maxMs: 420,
				avgMs: 47,
				totalBytes: 0,
				tokens: 0,
			},
			{
				tool: 'mcp-vertex_proposals_board',
				plugin: 'proposals',
				calls: 211,
				errors: 0,
				totalMs: 19_412,
				maxMs: 230,
				avgMs: 92,
				totalBytes: 0,
				tokens: 0,
			},
			{
				tool: 'mcp-vertex_memory_recall',
				plugin: 'memory',
				calls: 88,
				errors: 0,
				totalMs: 1_936,
				maxMs: 60,
				avgMs: 22,
				totalBytes: 0,
				tokens: 0,
			},
		],
		sparklines: {
			'mcp-vertex_overview': [12, 14, 18, 16, 18, 22, 18, 17, 19, 18],
			'mcp-vertex_search': [30, 42, 47, 51, 60, 48, 44, 39, 50, 47],
			'mcp-vertex_proposals_board': [
				88, 90, 95, 102, 110, 92, 89, 91, 95, 92,
			],
			'mcp-vertex_memory_recall': [
				18, 20, 22, 24, 22, 21, 20, 22, 23, 22,
			],
		},
		collectedAt: '2026-06-21T11:30:00Z',
	},
	tokens: {
		tokensUsed: 1_842_331,
		tokensSaved: 412_900,
		savingsPercent: 22,
		topByTokens: [
			{
				tool: 'mcp-vertex_proposals_board',
				plugin: 'proposals',
				calls: 211,
				errors: 0,
				totalMs: 19_412,
				maxMs: 230,
				avgMs: 92,
				totalBytes: 0,
				tokens: 980_000,
			},
			{
				tool: 'mcp-vertex_search',
				plugin: 'search',
				calls: 318,
				errors: 1,
				totalMs: 14_910,
				maxMs: 420,
				avgMs: 47,
				totalBytes: 0,
				tokens: 412_000,
			},
		],
		history: [
			{ at: '2026-06-20T00:00:00Z', tokens: 22_000 },
			{ at: '2026-06-20T12:00:00Z', tokens: 88_000 },
			{ at: '2026-06-21T00:00:00Z', tokens: 142_000 },
			{ at: '2026-06-21T11:30:00Z', tokens: 198_000 },
		],
	},
	tools: {
		rows: [
			{
				tool: 'mcp-vertex_overview',
				plugin: 'core',
				calls: 412,
				errors: 2,
				totalMs: 7_416,
				maxMs: 80,
				avgMs: 18,
				totalBytes: 0,
				tokens: 0,
			},
			{
				tool: 'mcp-vertex_search',
				plugin: 'search',
				calls: 318,
				errors: 1,
				totalMs: 14_910,
				maxMs: 420,
				avgMs: 47,
				totalBytes: 0,
				tokens: 0,
			},
			{
				tool: 'mcp-vertex_proposals_board',
				plugin: 'proposals',
				calls: 211,
				errors: 0,
				totalMs: 19_412,
				maxMs: 230,
				avgMs: 92,
				totalBytes: 0,
				tokens: 0,
			},
			{
				tool: 'mcp-vertex_memory_recall',
				plugin: 'memory',
				calls: 88,
				errors: 0,
				totalMs: 1_936,
				maxMs: 60,
				avgMs: 22,
				totalBytes: 0,
				tokens: 0,
			},
		],
		sortBy: 'calls',
		sortDir: 'desc',
	},
	plugins: {
		rows: [
			{
				plugin: 'core',
				tools: 6,
				calls: 412,
				errors: 2,
				avgMs: 18,
				tokens: 0,
				tokenSharePercent: 1,
			},
			{
				plugin: 'memory',
				tools: 4,
				calls: 88,
				errors: 0,
				avgMs: 22,
				tokens: 0,
				tokenSharePercent: 1,
			},
			{
				plugin: 'proposals',
				tools: 8,
				calls: 211,
				errors: 0,
				avgMs: 92,
				tokens: 980_000,
				tokenSharePercent: 53,
			},
			{
				plugin: 'search',
				tools: 3,
				calls: 318,
				errors: 1,
				avgMs: 47,
				tokens: 412_000,
				tokenSharePercent: 22,
			},
		],
	},
	proposals: {
		total: 2,
		byStatus: { in_progress: 2, ready: 4, done: 17 },
		rows: [
			{
				id: 'p111',
				title: 'Memory store concurrency spec',
				status: 'in_progress',
				track: 'memory',
				agent: 'claude-code',
				slice: 's4',
			},
			{
				id: 'p112',
				title: 'Local aliases web/web consolidation',
				status: 'in_progress',
				track: 'web',
				agent: 'copilot',
				slice: 's2',
			},
		],
	},
	kpis: {
		totals: {
			tools: 47,
			plugins: 9,
			proposals: 23,
			calls: 1284,
			errors: 4,
			totalMs: 38_211,
			tokens: 1_842_331,
			tokensSaved: 412_900,
			savingsPercent: 22,
			agents: 3,
		},
		tokens: { used: 1_842_331, saved: 412_900, savingsPercent: 22 },
		latency: { totalWallMs: 38_211, p50Ms: 22, p95Ms: 230 },
		spend: null,
	},
	docs: {
		pluginLoaded: true,
		tools: ['mcp-vertex_docs_search', 'mcp-vertex_docs_open'],
		knowledge: [
			{ id: 'p001-overview', title: 'Overview' },
			{ id: 'p002-arch', title: 'Architecture' },
		],
		recommendedNextAction: 'Open the documentation panel.',
	},
	// f00118 S1/S2: real spend telemetry, populated when usage-tracking is
	// loaded (null otherwise). The dev preview exercises the populated case
	// so the Spend panel always has something to render.
	spend: {
		totalCostUsd: 4.82,
		totalTokensSaved: 214_000,
		savingsPercent: 18,
		windowDays: 7,
		byProvider: [
			{ provider: 'anthropic', costUsd: 3.1, calls: 260 },
			{ provider: 'openai', costUsd: 1.72, calls: 94 },
		],
	},
	sessions: {
		total: 2,
		byStatus: { in_progress: 2, ready: 4, done: 17 },
		rows: [
			{
				id: 'p111',
				title: 'Memory store concurrency spec',
				status: 'in_progress',
				track: 'memory',
				agent: 'claude-code',
				slice: 's4',
			},
			{
				id: 'p112',
				title: 'Local aliases web/web consolidation',
				status: 'in_progress',
				track: 'web',
				agent: 'copilot',
				slice: 's2',
			},
		],
	},
	times: {
		totalWallMs: 38_211,
		slowestTool: { tool: 'mcp-vertex_search', maxMs: 420 },
		p50Ms: 22,
		p95Ms: 230,
		histogram: [
			{ bucket: '< 10ms', count: 318 },
			{ bucket: '10-50ms', count: 642 },
			{ bucket: '50-100ms', count: 211 },
			{ bucket: '100-500ms', count: 102 },
			{ bucket: '> 500ms', count: 11 },
		],
	},
	agents: {
		agents: [
			{
				name: 'claude-code',
				currentProposal: 'p111',
				currentSlice: 's4',
				lockHeld: 'memory-store',
				lastHeartbeat: '2026-06-21T11:30:00Z',
			},
			{
				name: 'copilot',
				currentProposal: 'p112',
				currentSlice: 's2',
				lastHeartbeat: '2026-06-21T11:25:00Z',
			},
			{ name: 'gemini', lastHeartbeat: '2026-06-20T18:02:00Z' },
		],
		totalActive: 2,
	},
	memory: {
		state: 'unavailable',
		notes: [],
		total: 0,
		offset: 0,
	},
	health: {
		healthy: true,
		locksActive: 1,
		queue: {
			length: 0,
			queued: 0,
			orphans: 0,
			oldestAgeMinutes: 0,
			threshold: '30m',
		},
		orphans: 0,
		orphansThreshold: '30m',
		stale: [],
		staleCount: 0,
		agents: ['claude-code', 'copilot', 'gemini'],
		fetchedAt: '2026-06-21T11:30:00Z',
	},
	workspace: {
		overview: {
			state: 'ready',
			data: {
				serverName: 'mcp-vertex',
				serverVersion: '0.42.0',
				namespacePrefix: 'mcp-vertex',
				plugins: [
					{ name: 'core', version: '0.42.0' },
					{ name: 'memory', version: '0.9.1' },
					{ name: 'proposals', version: '1.2.0' },
				],
				tools: [
					{ name: 'mcp-vertex_overview', plugin: 'core' },
					{ name: 'mcp-vertex_search', plugin: 'search' },
					{ name: 'mcp-vertex_proposals_board', plugin: 'proposals' },
					{ name: 'mcp-vertex_memory_recall', plugin: 'memory' },
				],
				knowledgeIds: ['p001-overview', 'p002-arch', 'p003-styleguide'],
				recommendedNextAction: 'Pick a slice from the Proposals tab.',
				totals: {
					tools: 47,
					plugins: 9,
					proposals: 23,
					calls: 1284,
					errors: 4,
					totalMs: 38_211,
					tokens: 1_842_331,
					tokensSaved: 412_900,
					savingsPercent: 22,
					agents: 3,
				},
			},
		},
		tools: {
			state: 'ready',
			data: { rows: [], sortBy: 'calls', sortDir: 'desc' },
		},
		plugins: { state: 'ready', data: { rows: [] } },
		memory: {
			state: 'unavailable',
			data: { state: 'unavailable', notes: [], total: 0, offset: 0 },
		},
		proposals: {
			state: 'ready',
			data: {
				total: 2,
				byStatus: { in_progress: 2, ready: 4, done: 17 },
				rows: [],
			},
		},
		agents: { state: 'ready', data: { agents: [], totalActive: 0 } },
		kpis: {
			state: 'ready',
			data: {
				totals: {
					tools: 47,
					plugins: 9,
					proposals: 23,
					calls: 1284,
					errors: 4,
					totalMs: 38_211,
					tokens: 1_842_331,
					tokensSaved: 412_900,
					savingsPercent: 22,
					agents: 3,
				},
				tokens: { used: 1_842_331, saved: 412_900, savingsPercent: 22 },
				latency: { totalWallMs: 38_211, p50Ms: 22, p95Ms: 230 },
				spend: null,
			},
		},
		health: {
			state: 'ready',
			data: {
				healthy: true,
				locksActive: 1,
				queue: {
					length: 0,
					queued: 0,
					orphans: 0,
					oldestAgeMinutes: 0,
					threshold: '30m',
				},
				orphans: 0,
				orphansThreshold: '30m',
				stale: [],
				staleCount: 0,
				agents: ['claude-code', 'copilot', 'gemini'],
				fetchedAt: '2026-06-21T11:30:00Z',
			},
		},
		docs: {
			state: 'ready',
			data: {
				pluginLoaded: true,
				tools: ['mcp-vertex_docs_search', 'mcp-vertex_docs_open'],
				knowledge: [
					{ id: 'p001-overview', title: 'Overview' },
					{ id: 'p002-arch', title: 'Architecture' },
				],
				recommendedNextAction: 'Open the documentation panel.',
			},
		},
	},
	server: {
		name: 'mcp-vertex',
		version: '0.42.0',
		fetchedAt: '2026-06-21T11:30:00Z',
	},
};
