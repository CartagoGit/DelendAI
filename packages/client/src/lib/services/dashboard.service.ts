/**
 * `DashboardService` — aggregates the data the IDE dashboard webview
 * needs in a single round-trip. Built on top of `McpStdioClient`,
 * `OverviewService`, `MetricsService` and a few direct
 * `client.request(...)` calls for proposal / agent data.
 *
 * All eight models are derived (no new MCP tools). They are pure
 * functions of the existing payloads so the server stays the source
 * of truth and the dashboard never invents data.
 *
 * Plugin attribution is AUTHORITATIVE: it comes from the overview (which
 * carries each tool's owning plugin) rather than parsing it out of the
 * qualified name. Parsing is unreliable because a core tool with an
 * underscore id (`mcp-vertex_fs_read`, `mcp-vertex_agent_catalog`) is
 * structurally identical to a plugin tool (`mcp-vertex_<plugin>_<id>`);
 * `pluginFromToolName` is only the fallback for names the overview omits.
 *
 * `getAllModels` fetches each upstream payload EXACTLY ONCE and derives
 * all eight models from it — the per-model public methods fetch their own
 * slices for standalone use, but the batch path never re-fetches.
 */
import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';
import { HealthService } from './health.service';
import type { MetricsService } from './metrics.service';
import {
	normalizeCompactTools,
	type OverviewService,
	pluginFromToolName,
} from './overview.service';
import { formatToolName } from './_namespace';
import type { IOverview } from '../contracts/interfaces/tool-descriptor.interface';
import type {
	IDashboardAgentsModel,
	IDashboardAllModels,
	IDashboardMetricsModel,
	IDashboardOverviewModel,
	IDashboardPluginsModel,
	IDashboardSessionsModel,
	IDashboardSpendModel,
	IDashboardTimesModel,
	IDashboardTokensModel,
	IDashboardToolsModel,
	IDashboardTotals,
	IToolMetricRow,
} from '../contracts/interfaces/dashboard.interface';

export interface IDashboardServiceOptions {
	readonly client: McpStdioClient;
	readonly overview?: OverviewService;
	readonly metrics?: MetricsService;
	readonly namespacePrefix?: string;
}

const TOKENS_PER_BYTE = 0.25; // 1 token ≈ 4 chars

const tokensFromBytes = (bytes: number): number =>
	Math.ceil(bytes * TOKENS_PER_BYTE);

/**
 * Compact responses are ~18% smaller on average in our reference dataset;
 * this is the conservative number reported in
 * `docs/mcp-vertex/TOKEN-BUDGETS.md`. Future revisions can compute this
 * from a compact-vs-full diff if the server exposes it.
 */
const estimateTokensSaved = (totalBytes: number): number =>
	Math.round(tokensFromBytes(totalBytes) * 0.18);

/**
 * Savings as a percentage of the tokens actually used. Single source of
 * truth so the overview totals and the tokens model never disagree on the
 * same "Savings" figure (they diverged once — one used `saved/used`, the
 * other `saved/(saved+used)`).
 */
const savingsPercentOf = (tokensSaved: number, tokensUsed: number): number =>
	tokensUsed === 0 ? 0 : Math.round((100 * tokensSaved) / tokensUsed);

/** Resolve a tool name to its owning plugin. */
type PluginOf = (toolName: string) => string;

/** The shape returned by `snapshotMetrics` (server metrics, defaulted). */
interface IMetricsSnap {
	readonly tools: Readonly<
		Record<
			string,
			{
				calls: number;
				errors: number;
				totalMs: number;
				maxMs: number;
				totalBytes: number;
			}
		>
	>;
	readonly totals: {
		calls: number;
		errors: number;
		totalMs: number;
		totalBytes: number;
	};
}

interface IProposalRow {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly track: string;
}

const buildRow = (
	tool: string,
	m: {
		calls: number;
		errors: number;
		totalMs: number;
		maxMs: number;
		totalBytes: number;
	},
	pluginOf: PluginOf,
): IToolMetricRow => ({
	tool,
	plugin: pluginOf(tool),
	calls: m.calls,
	errors: m.errors,
	totalMs: m.totalMs,
	maxMs: m.maxMs,
	avgMs: m.calls === 0 ? 0 : Math.round(m.totalMs / m.calls),
	totalBytes: m.totalBytes,
	tokens: tokensFromBytes(m.totalBytes),
});

const emptyTotals: IDashboardTotals = {
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
};

// --- Pure model builders (functions of already-fetched payloads) ---------

/**
 * Build the authoritative tool→plugin resolver from an overview payload.
 * `normalizeCompactTools` carries the plugin explicitly (the compact
 * overview groups tools under their plugin key), so this map is correct
 * even for core tools whose id contains an underscore. Any tool the
 * overview does not list falls back to name parsing.
 */
const pluginResolverFrom = (overview: IOverview): PluginOf => {
	const map = new Map<string, string>();
	for (const t of normalizeCompactTools(
		overview.tools,
		overview.namespacePrefix,
	)) {
		map.set(t.name, t.plugin);
	}
	return (tool: string): string => map.get(tool) ?? pluginFromToolName(tool);
};

const buildOverviewModel = (
	overview: IOverview,
	snap: IMetricsSnap,
	proposals: readonly IProposalRow[],
	agents: readonly string[],
): IDashboardOverviewModel => {
	// `overview.tools` is grouped by plugin in compact mode; flatten to a
	// stable list of qualified tools (the helper also accepts the full
	// array form, so this stays correct if the caller ever passes full).
	const flatTools = normalizeCompactTools(
		overview.tools,
		overview.namespacePrefix,
	);
	const tokens = tokensFromBytes(snap.totals.totalBytes);
	const tokensSaved = estimateTokensSaved(snap.totals.totalBytes);
	const totals: IDashboardTotals = {
		tools: flatTools.length,
		plugins: overview.plugins.length,
		proposals: proposals.length,
		calls: snap.totals.calls,
		errors: snap.totals.errors,
		totalMs: snap.totals.totalMs,
		tokens,
		tokensSaved,
		savingsPercent: savingsPercentOf(tokensSaved, tokens),
		agents: agents.length,
	};

	return {
		serverName: overview.server.name,
		serverVersion: overview.server.version,
		namespacePrefix: overview.namespacePrefix,
		plugins: overview.plugins.map((p) =>
			typeof p === 'string'
				? { name: p }
				: {
						name: p.name,
						...(p.version === undefined
							? {}
							: { version: p.version }),
					},
		),
		tools: flatTools.map((t) => ({ name: t.name, plugin: t.plugin })),
		knowledgeIds: overview.knowledge.map((k) =>
			typeof k === 'string' ? k : k.id,
		),
		recommendedNextAction: overview.recommendedNextAction,
		totals,
	};
};

const buildMetricsModel = (
	snap: IMetricsSnap,
	pluginOf: PluginOf,
): IDashboardMetricsModel => ({
	totals: snap.totals,
	rows: Object.entries(snap.tools)
		.map(([tool, m]) => buildRow(tool, m, pluginOf))
		.sort((a, b) => b.calls - a.calls),
	sparklines: {},
	collectedAt: new Date().toISOString(),
});

const buildTokensModel = (
	snap: IMetricsSnap,
	pluginOf: PluginOf,
): IDashboardTokensModel => {
	const rows = Object.entries(snap.tools)
		.map(([tool, m]) => buildRow(tool, m, pluginOf))
		.sort((a, b) => b.tokens - a.tokens);
	const tokensUsed = tokensFromBytes(snap.totals.totalBytes);
	const tokensSaved = estimateTokensSaved(snap.totals.totalBytes);
	return {
		tokensUsed,
		tokensSaved,
		savingsPercent: savingsPercentOf(tokensSaved, tokensUsed),
		topByTokens: rows.slice(0, 10),
		history: [],
	};
};

const buildToolsModel = (
	snap: IMetricsSnap,
	pluginOf: PluginOf,
): IDashboardToolsModel => ({
	rows: Object.entries(snap.tools)
		.map(([tool, m]) => buildRow(tool, m, pluginOf))
		.sort((a, b) => b.calls - a.calls),
	sortBy: 'calls',
	sortDir: 'desc',
});

const buildPluginsModel = (
	snap: IMetricsSnap,
	pluginOf: PluginOf,
): IDashboardPluginsModel => {
	const totalTokens = Object.values(snap.tools).reduce(
		(sum, m) => sum + tokensFromBytes(m.totalBytes),
		0,
	);
	const byPlugin = new Map<
		string,
		{
			tools: number;
			calls: number;
			errors: number;
			totalMs: number;
			tokens: number;
		}
	>();
	for (const [tool, m] of Object.entries(snap.tools)) {
		const plugin = pluginOf(tool);
		const row = byPlugin.get(plugin) ?? {
			tools: 0,
			calls: 0,
			errors: 0,
			totalMs: 0,
			tokens: 0,
		};
		row.tools += 1;
		row.calls += m.calls;
		row.errors += m.errors;
		row.totalMs += m.totalMs;
		row.tokens += tokensFromBytes(m.totalBytes);
		byPlugin.set(plugin, row);
	}
	return {
		rows: [...byPlugin.entries()]
			.map(([plugin, r]) => ({
				plugin,
				tools: r.tools,
				calls: r.calls,
				errors: r.errors,
				avgMs: r.calls === 0 ? 0 : Math.round(r.totalMs / r.calls),
				tokens: r.tokens,
				tokenSharePercent:
					totalTokens === 0
						? 0
						: Math.round((100 * r.tokens) / totalTokens),
			}))
			.sort((a, b) => b.tokens - a.tokens),
	};
};

/**
 * The real `usage_report` output type (generated SDK) — using it
 * instead of a hand-rolled shape means a future field rename on the
 * plugin side fails THIS file's typecheck instead of silently
 * producing `undefined` at runtime (the exact class of drift x00105
 * hardened the verify gate against).
 */
type IUsageReportOutput =
	McpVertexToolOutputs['mcp-vertex_usage-tracking_usage_report'];

const buildSpendModel = (report: IUsageReportOutput): IDashboardSpendModel => ({
	totalCostUsd: report.totals.costUsd,
	totalTokensSaved: report.totals.tokensSaved,
	savingsPercent: report.totals.savingsPercent,
	windowDays: report.windowDays,
	byProvider: report.buckets.map((b) => ({
		provider: b.key,
		costUsd: b.costUsd,
		calls: b.calls,
	})),
});

const buildSessionsModel = (
	proposals: readonly IProposalRow[],
): IDashboardSessionsModel => {
	const byStatus: Record<string, number> = {};
	for (const p of proposals) {
		byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
	}
	return {
		total: proposals.length,
		byStatus,
		rows: proposals.map((p) => ({
			id: p.id,
			title: p.title,
			status: p.status,
			track: p.track,
		})),
	};
};

const buildTimesModel = (snap: IMetricsSnap): IDashboardTimesModel => {
	const entries = Object.entries(snap.tools);
	let slowest: { tool: string; maxMs: number } | undefined;
	let totalMax = 0;
	for (const [tool, m] of entries) {
		if (m.maxMs > totalMax) {
			totalMax = m.maxMs;
			slowest = { tool, maxMs: m.maxMs };
		}
	}
	const latencies = entries.map(([, m]) => m.totalMs / Math.max(1, m.calls));
	latencies.sort((a, b) => a - b);
	const p = (q: number): number => {
		if (latencies.length === 0) return 0;
		const ix = Math.min(
			latencies.length - 1,
			Math.floor(q * (latencies.length - 1)),
		);
		return Math.round(latencies[ix] ?? 0);
	};
	const histogram = [
		{ bucket: '<10ms', count: latencies.filter((l) => l < 10).length },
		{
			bucket: '10–50ms',
			count: latencies.filter((l) => l >= 10 && l < 50).length,
		},
		{
			bucket: '50–200ms',
			count: latencies.filter((l) => l >= 50 && l < 200).length,
		},
		{
			bucket: '200ms–1s',
			count: latencies.filter((l) => l >= 200 && l < 1000).length,
		},
		{ bucket: '≥1s', count: latencies.filter((l) => l >= 1000).length },
	];
	return {
		totalWallMs: snap.totals.totalMs,
		...(slowest === undefined ? {} : { slowestTool: slowest }),
		p50Ms: p(0.5),
		p95Ms: p(0.95),
		histogram,
	};
};

const buildAgentsModel = (
	agents: readonly string[],
): IDashboardAgentsModel => ({
	agents: agents.map((name) => ({ name })),
	totalActive: agents.length,
});

export class DashboardService {
	private readonly client: McpStdioClient;
	private readonly overview: OverviewService | undefined;
	private readonly metrics: MetricsService | undefined;
	private readonly namespacePrefix: string | undefined;

	constructor(options: IDashboardServiceOptions) {
		this.client = options.client;
		this.overview = options.overview;
		this.metrics = options.metrics;
		this.namespacePrefix = options.namespacePrefix;
	}

	async getOverviewModel(): Promise<IDashboardOverviewModel> {
		const [overview, metrics, proposals, agents] = await Promise.all([
			this.fetchOverview(),
			this.snapshotMetrics(),
			this.fetchProposalsSafe(),
			this.fetchAgentsSafe(),
		]);
		return buildOverviewModel(overview, metrics, proposals, agents);
	}

	async getMetricsModel(): Promise<IDashboardMetricsModel> {
		const [snap, pluginOf] = await Promise.all([
			this.snapshotMetrics(),
			this.resolvePluginOf(),
		]);
		return buildMetricsModel(snap, pluginOf);
	}

	async getTokensModel(): Promise<IDashboardTokensModel> {
		const [snap, pluginOf] = await Promise.all([
			this.snapshotMetrics(),
			this.resolvePluginOf(),
		]);
		return buildTokensModel(snap, pluginOf);
	}

	async getToolsModel(): Promise<IDashboardToolsModel> {
		const [snap, pluginOf] = await Promise.all([
			this.snapshotMetrics(),
			this.resolvePluginOf(),
		]);
		return buildToolsModel(snap, pluginOf);
	}

	async getPluginsModel(): Promise<IDashboardPluginsModel> {
		const [snap, pluginOf] = await Promise.all([
			this.snapshotMetrics(),
			this.resolvePluginOf(),
		]);
		return buildPluginsModel(snap, pluginOf);
	}

	async getSessionsModel(): Promise<IDashboardSessionsModel> {
		return buildSessionsModel(await this.fetchProposalsSafe());
	}

	/**
	 * Real spend/cost telemetry from usage-tracking's `usage_report`
	 * (f00118 S1). `null` when the plugin is not loaded or the call
	 * fails — never thrown, so a dashboard without usage-tracking still
	 * renders everything else.
	 */
	async getSpendModel(): Promise<IDashboardSpendModel | null> {
		const overview = await this.fetchOverview();
		return this.fetchSpendSafe(overview);
	}

	async getTimesModel(): Promise<IDashboardTimesModel> {
		return buildTimesModel(await this.snapshotMetrics());
	}

	async getAgentsModel(): Promise<IDashboardAgentsModel> {
		return buildAgentsModel(await this.fetchAgentsSafe());
	}

	async getAllModels(): Promise<IDashboardAllModels> {
		// Fetch each upstream payload EXACTLY ONCE, then derive all eight
		// models from the shared data (previously every sub-model re-fetched
		// its own metrics/overview/proposals/agents — up to ~5 redundant
		// metrics round-trips per dashboard open).
		const [overview, metrics, proposals, agents, health] =
			await Promise.all([
				this.fetchOverview(),
				this.snapshotMetrics(),
				this.fetchProposalsSafe(),
				this.fetchAgentsSafe(),
				new HealthService(this.client).snapshot().catch(() => ({
					healthy: false,
					locksActive: 0,
					queue: null,
					orphans: 0,
					orphansThreshold: 'unknown',
					stale: [],
					staleCount: 0,
					agents: [],
					fetchedAt: new Date().toISOString(),
				})),
			]);
		// Fetched AFTER overview resolves (needs it to detect the plugin);
		// never blocks the rest of the dashboard on a slow/absent
		// usage-tracking round-trip.
		const spend = await this.fetchSpendSafe(overview);
		const pluginOf = pluginResolverFrom(overview);
		const overviewModel = buildOverviewModel(
			overview,
			metrics,
			proposals,
			agents,
		);
		return {
			overview: overviewModel,
			metrics: buildMetricsModel(metrics, pluginOf),
			tokens: buildTokensModel(metrics, pluginOf),
			tools: buildToolsModel(metrics, pluginOf),
			plugins: buildPluginsModel(metrics, pluginOf),
			spend,
			sessions: buildSessionsModel(proposals),
			times: buildTimesModel(metrics),
			agents: buildAgentsModel(agents),
			health,
			server: {
				name: overviewModel.serverName,
				version: overviewModel.serverVersion,
				fetchedAt: new Date().toISOString(),
			},
		};
	}

	private async fetchOverview(): Promise<IOverview> {
		return this.overview
			? this.overview.getOverview({ compact: true })
			: this.client.request<{ readonly compact: boolean }, IOverview>(
					formatToolName(this.namespacePrefix, 'overview'),
					{ compact: true },
				);
	}

	/** Authoritative tool→plugin resolver derived from the overview. */
	private async resolvePluginOf(): Promise<PluginOf> {
		return pluginResolverFrom(await this.fetchOverview());
	}

	private async snapshotMetrics(): Promise<IMetricsSnap> {
		const raw =
			this.metrics !== undefined
				? await this.metrics.snapshot()
				: await this.client.request(
						formatToolName(this.namespacePrefix, 'metrics'),
						{},
					);
		const snap = raw as {
			tools?: Record<
				string,
				{
					calls?: number;
					errors?: number;
					totalMs?: number;
					maxMs?: number;
					totalBytes?: number;
				}
			>;
			totals?: {
				calls?: number;
				errors?: number;
				totalMs?: number;
				totalBytes?: number;
			};
		};
		return {
			tools: Object.fromEntries(
				Object.entries(snap.tools ?? {}).map(([tool, m]) => [
					tool,
					{
						calls: m.calls ?? 0,
						errors: m.errors ?? 0,
						totalMs: m.totalMs ?? 0,
						maxMs: m.maxMs ?? 0,
						totalBytes: m.totalBytes ?? 0,
					},
				]),
			),
			totals: {
				calls: snap.totals?.calls ?? 0,
				errors: snap.totals?.errors ?? 0,
				totalMs: snap.totals?.totalMs ?? 0,
				totalBytes: snap.totals?.totalBytes ?? 0,
			},
		};
	}

	private async fetchProposalsSafe(): Promise<readonly IProposalRow[]> {
		try {
			const result = await this.client.request<
				Record<string, never>,
				{
					readonly proposals: readonly {
						readonly id: string;
						readonly title?: string;
						readonly status: string;
						readonly track?: string;
					}[];
				}
			>(
				formatToolName(
					this.namespacePrefix,
					'proposals_proposal_board',
				),
				{},
			);
			return result.proposals.map((p) => ({
				id: p.id,
				title: p.title ?? '',
				status: p.status,
				track: p.track ?? '',
			}));
		} catch {
			return [];
		}
	}

	/**
	 * f00118 S1: real spend telemetry from usage-tracking, joined onto
	 * the byte-based estimate everywhere else. `overview.plugins` is
	 * ALREADY fetched by every caller — checking it here avoids a
	 * doomed round-trip when the plugin was never loaded, and any
	 * runtime failure (plugin loaded but the call still errors) also
	 * degrades to `null` rather than throwing.
	 */
	private async fetchSpendSafe(
		overview: IOverview,
	): Promise<IDashboardSpendModel | null> {
		// `overview.plugins` is `string[]` in compact mode (what this
		// service always requests) or `{name, …}[]` in full mode.
		const loaded = overview.plugins.some((p) =>
			typeof p === 'string'
				? p === 'usage-tracking'
				: p.name === 'usage-tracking',
		);
		if (!loaded) return null;
		try {
			const report = await this.client.request<
				Record<string, never>,
				IUsageReportOutput
			>(
				formatToolName(
					this.namespacePrefix,
					'usage-tracking_usage_report',
				),
				{},
			);
			return buildSpendModel(report);
		} catch {
			return null;
		}
	}

	private async fetchAgentsSafe(): Promise<readonly string[]> {
		try {
			const result = await this.client.request<
				{ readonly action: 'list' },
				{
					readonly agents?: readonly { readonly name: string }[];
					readonly assignments?: readonly {
						readonly agent_name: string;
						readonly status?: 'active' | 'cooldown' | 'orphan';
					}[];
				}
			>(formatToolName(this.namespacePrefix, 'proposals_agent_names'), {
				action: 'list',
			});
			if (Array.isArray(result.agents)) {
				return result.agents.map((a) => a.name);
			}
			if (Array.isArray(result.assignments)) {
				return result.assignments
					.filter(
						(a) => a.status === undefined || a.status === 'active',
					)
					.map((a) => a.agent_name);
			}
			return [];
		} catch {
			return [];
		}
	}
}

export const createEmptyTotals = (): IDashboardTotals => ({ ...emptyTotals });
