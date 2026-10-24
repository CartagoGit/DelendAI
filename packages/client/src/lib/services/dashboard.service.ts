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
 * underscore id (`delendai_fs_read`, `delendai_agent_catalog`) is
 * structurally identical to a plugin tool (`delendai_<plugin>_<id>`);
 * `pluginFromToolName` is only the fallback for names the overview omits.
 *
 * `getAllModels` fetches each upstream payload EXACTLY ONCE and derives
 * all eight models from it — the per-model public methods fetch their own
 * slices for standalone use, but the batch path never re-fetches.
 */
import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IHealthSnapshot,
	IServerProposalStaleList,
	IServerStateHealth,
} from '../contracts/interfaces/health.interface';
import type { IMemoryListResult } from '../contracts/interfaces/memory.interface';
import type { MetricsService } from './metrics.service';
import {
	normalizeCompactTools,
	type OverviewService,
	pluginFromToolName,
} from './overview.service';
import { formatToolName } from './_namespace';
import type { IOverview } from '../contracts/interfaces/tool-descriptor.interface';
import type {
	IDashboardDataState,
	IDashboardAgentsModel,
	IDashboardAllModels,
	IDashboardDocsModel,
	IDashboardKpisModel,
	IDashboardMetricsModel,
	IDashboardMemoryModel,
	IDashboardOverviewModel,
	IDashboardPluginsModel,
	IDashboardSessionsModel,
	IDashboardSpendModel,
	IDashboardTimesModel,
	IDashboardTokensModel,
	IDashboardToolsModel,
	IDashboardTotals,
	IDashboardWorkspaceModel,
	IDashboardWorkspaceSection,
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
 * `docs/delendai/TOKEN-BUDGETS.md`. Future revisions can compute this
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

interface IDataResult<T> {
	readonly state: IDashboardDataState;
	readonly value: T;
}

interface IDashboardBatchSnapshot {
	readonly overview: IOverview;
	readonly metrics: IMetricsSnap;
	readonly proposals: IDataResult<readonly IProposalRow[]>;
	readonly agents: IDataResult<readonly string[]>;
	readonly health: IDataResult<IHealthSnapshot>;
	readonly spend: IDashboardSpendModel | null;
	readonly memory: IDataResult<IDashboardMemoryModel>;
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

const isPluginLoaded = (overview: IOverview, plugin: string): boolean =>
	overview.plugins.some((entry) =>
		typeof entry === 'string' ? entry === plugin : entry.name === plugin,
	);

const isPluginDefinitelyUnavailable = (
	overview: IOverview,
	plugin: string,
): boolean => overview.plugins.length > 0 && !isPluginLoaded(overview, plugin);

const stateFromCount = (count: number): IDashboardDataState =>
	count === 0 ? 'empty' : 'ready';

const section = <T>(
	state: IDashboardDataState,
	data: T,
): IDashboardWorkspaceSection<T> => ({ state, data });

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
type IUsageReportOutput = {
	readonly windowDays: number;
	readonly totals: {
		readonly costUsd: number;
		readonly tokensSaved: number;
		readonly savingsPercent: number;
	};
	readonly buckets: readonly {
		readonly key: string;
		readonly costUsd: number;
		readonly calls: number;
	}[];
};

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

const emptySessionsModel = (): IDashboardSessionsModel => ({
	total: 0,
	byStatus: {},
	rows: [],
});

const emptyAgentsModel = (): IDashboardAgentsModel => ({
	agents: [],
	totalActive: 0,
});

const unavailableHealthSnapshot = (): IHealthSnapshot => ({
	healthy: false,
	locksActive: 0,
	queue: null,
	orphans: 0,
	orphansThreshold: 'unknown',
	stale: [],
	staleCount: 0,
	agents: [],
	fetchedAt: new Date().toISOString(),
});

const unavailableMemoryModel = (): IDashboardMemoryModel => ({
	state: 'unavailable',
	notes: [],
	total: 0,
	offset: 0,
});

const loadingMemoryModel = (): IDashboardMemoryModel => ({
	state: 'loading',
	notes: [],
	total: 0,
	offset: 0,
});

const buildMemoryModel = (
	result: IMemoryListResult,
): IDashboardMemoryModel => ({
	state: result.total === 0 ? 'empty' : 'ready',
	notes: result.notes,
	total: result.total,
	offset: result.offset,
	...(result.nextOffset === undefined
		? {}
		: { nextOffset: result.nextOffset }),
});

const isMemoryListResult = (value: unknown): value is IMemoryListResult => {
	if (typeof value !== 'object' || value === null) return false;
	const result = value as Partial<IMemoryListResult>;
	return (
		Array.isArray(result.notes) &&
		typeof result.total === 'number' &&
		typeof result.offset === 'number'
	);
};

const buildDocsModel = (overview: IOverview): IDashboardDocsModel => {
	const tools = normalizeCompactTools(
		overview.tools,
		overview.namespacePrefix,
	)
		.filter((tool) => tool.plugin === 'docs')
		.map((tool) => tool.name);
	return {
		pluginLoaded: isPluginLoaded(overview, 'docs'),
		tools,
		knowledge: overview.knowledge.map((entry) =>
			typeof entry === 'string'
				? { id: entry }
				: { id: entry.id, title: entry.title },
		),
		recommendedNextAction: overview.recommendedNextAction,
	};
};

const buildKpisModel = (
	totals: IDashboardTotals,
	tokens: IDashboardTokensModel,
	times: IDashboardTimesModel,
	spend: IDashboardSpendModel | null,
): IDashboardKpisModel => ({
	totals,
	tokens: {
		used: tokens.tokensUsed,
		saved: tokens.tokensSaved,
		savingsPercent: tokens.savingsPercent,
	},
	latency: {
		totalWallMs: times.totalWallMs,
		p50Ms: times.p50Ms,
		p95Ms: times.p95Ms,
	},
	spend,
});

const buildHealthSnapshot = (
	stateHealth: IServerStateHealth | null,
	staleList: IServerProposalStaleList | null,
	agents: readonly string[],
): IHealthSnapshot => {
	const stale =
		staleList?.ok === true && Array.isArray(staleList.zombies)
			? staleList.zombies
			: [];
	return {
		healthy: stateHealth?.healthy === true,
		locksActive: stateHealth?.locks.active ?? 0,
		queue:
			stateHealth?.queue === undefined || stateHealth.queue === null
				? null
				: {
						length: stateHealth.queue.queueLength,
						queued: stateHealth.queue.queuedCount,
						orphans: stateHealth.queue.waiterOrphans,
						oldestAgeMinutes: stateHealth.queue.oldestAgeMinutes,
						threshold: stateHealth.queue.threshold,
					},
		orphans: stateHealth?.registry.orphans ?? 0,
		orphansThreshold: stateHealth?.registry.threshold ?? 'unknown',
		stale,
		staleCount: stale.length,
		agents,
		fetchedAt: new Date().toISOString(),
	};
};

const buildWorkspaceModel = (input: {
	overview: IDashboardOverviewModel;
	tools: IDashboardToolsModel;
	plugins: IDashboardPluginsModel;
	memory: IDashboardMemoryModel;
	proposals: IDashboardSessionsModel;
	agents: IDashboardAgentsModel;
	kpis: IDashboardKpisModel;
	health: IHealthSnapshot;
	docs: IDashboardDocsModel;
	proposalState: IDashboardDataState;
	agentState: IDashboardDataState;
	healthState: IDashboardDataState;
	memoryState: IDashboardDataState;
}): IDashboardWorkspaceModel => ({
	overview: section('ready', input.overview),
	tools: section(stateFromCount(input.tools.rows.length), input.tools),
	plugins: section(
		stateFromCount(input.overview.plugins.length),
		input.plugins,
	),
	memory: section(input.memoryState, input.memory),
	proposals: section(input.proposalState, input.proposals),
	agents: section(input.agentState, input.agents),
	kpis: section(
		input.overview.totals.tools === 0 &&
			input.overview.totals.plugins === 0 &&
			input.overview.totals.proposals === 0 &&
			input.overview.totals.agents === 0
			? 'empty'
			: 'ready',
		input.kpis,
	),
	health: section(input.healthState, input.health),
	docs: section(
		input.docs.tools.length > 0 || input.docs.knowledge.length > 0
			? 'ready'
			: input.docs.pluginLoaded
				? 'empty'
				: 'unavailable',
		input.docs,
	),
});

const buildLoadingWorkspaceModel = (
	namespacePrefix = 'delendai',
): IDashboardWorkspaceModel => {
	const overview: IDashboardOverviewModel = {
		serverName: '',
		serverVersion: '',
		namespacePrefix,
		plugins: [],
		tools: [],
		knowledgeIds: [],
		recommendedNextAction: '',
		totals: createEmptyTotals(),
	};
	const tools: IDashboardToolsModel = {
		rows: [],
		sortBy: 'calls',
		sortDir: 'desc',
	};
	const plugins: IDashboardPluginsModel = { rows: [] };
	const proposals = emptySessionsModel();
	const agents = emptyAgentsModel();
	const tokens: IDashboardTokensModel = {
		tokensUsed: 0,
		tokensSaved: 0,
		savingsPercent: 0,
		topByTokens: [],
		history: [],
	};
	const times: IDashboardTimesModel = {
		totalWallMs: 0,
		p50Ms: 0,
		p95Ms: 0,
		histogram: [],
	};
	const docs: IDashboardDocsModel = {
		pluginLoaded: false,
		tools: [],
		knowledge: [],
		recommendedNextAction: '',
	};
	const kpis = buildKpisModel(overview.totals, tokens, times, null);
	return {
		overview: section('loading', overview),
		tools: section('loading', tools),
		plugins: section('loading', plugins),
		memory: section('loading', loadingMemoryModel()),
		proposals: section('loading', proposals),
		agents: section('loading', agents),
		kpis: section('loading', kpis),
		health: section('loading', unavailableHealthSnapshot()),
		docs: section('loading', docs),
	};
};

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
		const overview = await this.fetchOverview();
		const [metrics, proposals, agents] = await Promise.all([
			this.snapshotMetrics(),
			this.fetchProposalsSafe(overview),
			this.fetchAgentsSafe(overview),
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
		const overview = await this.fetchOverview();
		return buildSessionsModel(await this.fetchProposalsSafe(overview));
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
		const overview = await this.fetchOverview();
		return buildAgentsModel(await this.fetchAgentsSafe(overview));
	}

	async getMemoryModel(): Promise<IDashboardMemoryModel> {
		const overview = await this.fetchOverview();
		return (await this.fetchMemorySafe(overview)).value;
	}

	getLoadingWorkspaceModel(): IDashboardWorkspaceModel {
		return buildLoadingWorkspaceModel(this.namespacePrefix);
	}

	async getWorkspaceModel(): Promise<IDashboardWorkspaceModel> {
		return (await this.getAllModels()).workspace;
	}

	async getAllModels(): Promise<IDashboardAllModels> {
		const batch = await this.collectBatchSnapshot();
		const pluginOf = pluginResolverFrom(batch.overview);
		const overviewModel = buildOverviewModel(
			batch.overview,
			batch.metrics,
			batch.proposals.value,
			batch.agents.value,
		);
		const toolsModel = buildToolsModel(batch.metrics, pluginOf);
		const pluginsModel = buildPluginsModel(batch.metrics, pluginOf);
		const proposalsModel = buildSessionsModel(batch.proposals.value);
		const timesModel = buildTimesModel(batch.metrics);
		const agentsModel = buildAgentsModel(batch.agents.value);
		const docsModel = buildDocsModel(batch.overview);
		const tokensModel = buildTokensModel(batch.metrics, pluginOf);
		const kpisModel = buildKpisModel(
			overviewModel.totals,
			tokensModel,
			timesModel,
			batch.spend,
		);
		const workspace = buildWorkspaceModel({
			overview: overviewModel,
			tools: toolsModel,
			plugins: pluginsModel,
			memory: batch.memory.value,
			proposals: proposalsModel,
			agents: agentsModel,
			kpis: kpisModel,
			health: batch.health.value,
			docs: docsModel,
			proposalState: batch.proposals.state,
			agentState: batch.agents.state,
			healthState: batch.health.state,
			memoryState: batch.memory.state,
		});
		return {
			overview: overviewModel,
			metrics: buildMetricsModel(batch.metrics, pluginOf),
			tokens: tokensModel,
			tools: toolsModel,
			plugins: pluginsModel,
			proposals: proposalsModel,
			kpis: kpisModel,
			docs: docsModel,
			spend: batch.spend,
			sessions: proposalsModel,
			times: timesModel,
			agents: agentsModel,
			memory: batch.memory.value,
			health: batch.health.value,
			workspace,
			server: {
				name: overviewModel.serverName,
				version: overviewModel.serverVersion,
				fetchedAt: new Date().toISOString(),
			},
		};
	}

	/**
	 * Collect every upstream payload at most once for a `getAllModels` batch.
	 * Future focused tests can assert transport call counts against this single
	 * snapshot boundary without depending on downstream model builders.
	 */
	private async collectBatchSnapshot(): Promise<IDashboardBatchSnapshot> {
		const [overview, metrics] = await Promise.all([
			this.fetchOverview(),
			this.snapshotMetrics(),
		]);
		const [proposals, agents] = await Promise.all([
			this.fetchProposalsResult(overview),
			this.fetchAgentsResult(overview),
		]);
		const [health, spend, memory] = await Promise.all([
			this.fetchHealthResult(overview, agents.value),
			this.fetchSpendSafe(overview),
			this.fetchMemorySafe(overview),
		]);
		return {
			overview,
			metrics,
			proposals,
			agents,
			health,
			spend,
			memory,
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

	private async fetchProposalsResult(
		overview: IOverview,
	): Promise<IDataResult<readonly IProposalRow[]>> {
		if (isPluginDefinitelyUnavailable(overview, 'proposals')) {
			return { state: 'unavailable', value: [] };
		}
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
			const proposals = result.proposals.map((p) => ({
				id: p.id,
				title: p.title ?? '',
				status: p.status,
				track: p.track ?? '',
			}));
			return {
				state: stateFromCount(proposals.length),
				value: proposals,
			};
		} catch {
			return { state: 'unavailable', value: [] };
		}
	}

	private async fetchProposalsSafe(
		overview?: IOverview,
	): Promise<readonly IProposalRow[]> {
		const source = await this.fetchProposalsResult(
			overview ?? (await this.fetchOverview()),
		);
		return source.value;
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

	private async fetchMemorySafe(
		overview: IOverview,
	): Promise<IDataResult<IDashboardMemoryModel>> {
		if (isPluginDefinitelyUnavailable(overview, 'memory')) {
			return {
				state: 'unavailable',
				value: unavailableMemoryModel(),
			};
		}
		try {
			const result: unknown = await this.client.request<
				{ readonly limit: number },
				unknown
			>(formatToolName(this.namespacePrefix, 'memory_list'), {
				limit: 100,
			});
			return isMemoryListResult(result)
				? {
						state: result.total === 0 ? 'empty' : 'ready',
						value: buildMemoryModel(result),
					}
				: {
						state: 'unavailable',
						value: unavailableMemoryModel(),
					};
		} catch {
			return {
				state: 'unavailable',
				value: unavailableMemoryModel(),
			};
		}
	}

	private async fetchAgentsResult(
		overview: IOverview,
	): Promise<IDataResult<readonly string[]>> {
		if (isPluginDefinitelyUnavailable(overview, 'proposals')) {
			return { state: 'unavailable', value: [] };
		}
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
				const agents = result.agents.map((a) => a.name);
				return { state: stateFromCount(agents.length), value: agents };
			}
			if (Array.isArray(result.assignments)) {
				const agents = result.assignments
					.filter(
						(a) => a.status === undefined || a.status === 'active',
					)
					.map((a) => a.agent_name);
				return { state: stateFromCount(agents.length), value: agents };
			}
			return { state: 'empty', value: [] };
		} catch {
			return { state: 'unavailable', value: [] };
		}
	}

	private async fetchAgentsSafe(
		overview?: IOverview,
	): Promise<readonly string[]> {
		const source = await this.fetchAgentsResult(
			overview ?? (await this.fetchOverview()),
		);
		return source.value;
	}

	private async fetchHealthResult(
		overview: IOverview,
		agents: readonly string[],
	): Promise<IDataResult<IHealthSnapshot>> {
		if (isPluginDefinitelyUnavailable(overview, 'proposals')) {
			return {
				state: 'unavailable',
				value: unavailableHealthSnapshot(),
			};
		}
		try {
			const [stateHealth, staleList] = await Promise.all([
				this.client.request<Record<string, never>, IServerStateHealth>(
					formatToolName(
						overview.namespacePrefix,
						'proposals_state_health',
					),
					{},
				),
				this.client
					.request<Record<string, never>, IServerProposalStaleList>(
						formatToolName(
							overview.namespacePrefix,
							'proposals_proposal_stale_list',
						),
						{},
					)
					.catch(() => null),
			]);
			return {
				state: 'ready',
				value: buildHealthSnapshot(stateHealth, staleList, agents),
			};
		} catch {
			return {
				state: 'unavailable',
				value: unavailableHealthSnapshot(),
			};
		}
	}
}

export const createEmptyTotals = (): IDashboardTotals => ({ ...emptyTotals });
