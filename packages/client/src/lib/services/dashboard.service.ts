/**
 * `DashboardService` — aggregates the data the IDE dashboard webview
 * needs in a single round-trip. Built on top of `McpStdioClient`,
 * `OverviewService`, `MetricsService` and a few direct
 * `client.request(...)` calls for proposal / agent data.
 *
 * All eight models are derived (no new MCP tools). They are pure
 * functions of the existing payloads so the server stays the source
 * of truth and the dashboard never invents data.
 */
import type { McpStdioClient } from '../transport/mcp-stdio-client';
import { HealthService } from './health.service';
import type { MetricsService } from './metrics.service';
import type { OverviewService } from './overview.service';
import type { IOverview } from '../contracts/interfaces/tool-descriptor.interface';
import type {
	IDashboardAgentsModel,
	IDashboardAllModels,
	IDashboardMetricsModel,
	IDashboardOverviewModel,
	IDashboardPluginsModel,
	IDashboardSessionsModel,
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
}

const pluginFromToolName = (tool: string): string => {
	const ix = tool.indexOf('_');
	return ix === -1 ? tool : tool.slice(0, ix);
};

const TOKENS_PER_BYTE = 0.25; // 1 token ≈ 4 chars

const tokensFromBytes = (bytes: number): number =>
	Math.ceil(bytes * TOKENS_PER_BYTE);

const buildRow = (
	tool: string,
	m: {
		calls: number;
		errors: number;
		totalMs: number;
		maxMs: number;
		totalBytes: number;
	},
): IToolMetricRow => ({
	tool,
	plugin: pluginFromToolName(tool),
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

export class DashboardService {
	private readonly client: McpStdioClient;
	private readonly overview: OverviewService | undefined;
	private readonly metrics: MetricsService | undefined;

	constructor(options: IDashboardServiceOptions) {
		this.client = options.client;
		this.overview = options.overview;
		this.metrics = options.metrics;
	}

	async getOverviewModel(): Promise<IDashboardOverviewModel> {
		const overview = this.overview
			? await this.overview.getOverview({ compact: true })
			: await this.client.request<
					{ readonly compact: boolean },
					IOverview
				>('mcp-vertex_overview', { compact: true });
		const metrics = await this.snapshotMetrics();
		const proposals = await this.fetchProposalsSafe();
		const agents = await this.fetchAgentsSafe();
		const tokensSaved = this.estimateTokensSaved(overview, metrics);

		const totals: IDashboardTotals = {
			tools: overview.tools.length,
			plugins: overview.plugins.length,
			proposals: proposals.length,
			calls: metrics.totals.calls,
			errors: metrics.totals.errors,
			totalMs: metrics.totals.totalMs,
			tokens: tokensFromBytes(metrics.totals.totalBytes),
			tokensSaved,
			savingsPercent:
				tokensSaved + tokensFromBytes(metrics.totals.totalBytes) === 0
					? 0
					: Math.round(
							(100 * tokensSaved) /
								(tokensSaved +
									tokensFromBytes(metrics.totals.totalBytes)),
						),
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
			tools: overview.tools.map((t) => ({
				name: typeof t === 'string' ? t : t.name,
				plugin: pluginFromToolName(typeof t === 'string' ? t : t.name),
			})),
			knowledgeIds: overview.knowledge.map((k) =>
				typeof k === 'string' ? k : k.id,
			),
			recommendedNextAction: overview.recommendedNextAction,
			totals,
		};
	}

	async getMetricsModel(): Promise<IDashboardMetricsModel> {
		const snap = await this.snapshotMetrics();
		const rows: IToolMetricRow[] = Object.entries(snap.tools)
			.map(([tool, m]) => buildRow(tool, m))
			.sort((a, b) => b.calls - a.calls);
		return {
			totals: snap.totals,
			rows,
			sparklines: {},
			collectedAt: new Date().toISOString(),
		};
	}

	async getTokensModel(): Promise<IDashboardTokensModel> {
		const snap = await this.snapshotMetrics();
		const rows = Object.entries(snap.tools)
			.map(([tool, m]) => buildRow(tool, m))
			.sort((a, b) => b.tokens - a.tokens);
		const tokensUsed = tokensFromBytes(snap.totals.totalBytes);
		const tokensSaved = this.estimateTokensSaved(undefined, snap);
		return {
			tokensUsed,
			tokensSaved,
			savingsPercent:
				tokensUsed === 0
					? 0
					: Math.round((100 * tokensSaved) / tokensUsed),
			topByTokens: rows.slice(0, 10),
			history: [],
		};
	}

	async getToolsModel(): Promise<IDashboardToolsModel> {
		const snap = await this.snapshotMetrics();
		const rows = Object.entries(snap.tools)
			.map(([tool, m]) => buildRow(tool, m))
			.sort((a, b) => b.calls - a.calls);
		return { rows, sortBy: 'calls', sortDir: 'desc' };
	}

	async getPluginsModel(): Promise<IDashboardPluginsModel> {
		const snap = await this.snapshotMetrics();
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
			const plugin = pluginFromToolName(tool);
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
	}

	async getSessionsModel(): Promise<IDashboardSessionsModel> {
		const proposals = await this.fetchProposalsSafe();
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
	}

	async getTimesModel(): Promise<IDashboardTimesModel> {
		const snap = await this.snapshotMetrics();
		const entries = Object.entries(snap.tools);
		let slowest: { tool: string; maxMs: number } | undefined;
		let totalMax = 0;
		for (const [tool, m] of entries) {
			if (m.maxMs > totalMax) {
				totalMax = m.maxMs;
				slowest = { tool, maxMs: m.maxMs };
			}
		}
		const latencies = entries.map(
			([, m]) => m.totalMs / Math.max(1, m.calls),
		);
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
	}

	async getAgentsModel(): Promise<IDashboardAgentsModel> {
		const agents = await this.fetchAgentsSafe();
		return {
			agents: agents.map((name) => ({ name })),
			totalActive: agents.length,
		};
	}

	async getAllModels(): Promise<IDashboardAllModels> {
		const [
			overview,
			metrics,
			tokens,
			tools,
			plugins,
			sessions,
			times,
			agents,
			health,
		] = await Promise.all([
			this.getOverviewModel(),
			this.getMetricsModel(),
			this.getTokensModel(),
			this.getToolsModel(),
			this.getPluginsModel(),
			this.getSessionsModel(),
			this.getTimesModel(),
			this.getAgentsModel(),
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
		return {
			overview,
			metrics,
			tokens,
			tools,
			plugins,
			sessions,
			times,
			agents,
			health,
			server: {
				name: overview.serverName,
				version: overview.serverVersion,
				fetchedAt: new Date().toISOString(),
			},
		};
	}

	private async snapshotMetrics(): Promise<{
		tools: Readonly<
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
		totals: {
			calls: number;
			errors: number;
			totalMs: number;
			totalBytes: number;
		};
	}> {
		const raw =
			this.metrics !== undefined
				? await this.metrics.snapshot()
				: await this.client.request('mcp-vertex_metrics', {});
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

	private async fetchProposalsSafe(): Promise<
		readonly {
			readonly id: string;
			readonly title: string;
			readonly status: string;
			readonly track: string;
		}[]
	> {
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
			>('proposals_proposal_board', {});
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

	private async fetchAgentsSafe(): Promise<readonly string[]> {
		try {
			const result = await this.client.request<
				Record<string, never>,
				{
					readonly agents: readonly { readonly name: string }[];
				}
			>('proposals_agent_names', {});
			return result.agents.map((a) => a.name);
		} catch {
			return [];
		}
	}

	private estimateTokensSaved(
		_overview: unknown,
		metrics: {
			totals: { totalBytes: number };
		},
	): number {
		// Compact responses are ~18% smaller on average in our reference
		// dataset; this is the conservative number reported in
		// `docs/mcp-vertex/TOKEN-BUDGETS.md`. Future revisions can compute this
		// from a compact-vs-full diff if the server exposes it.
		return Math.round(tokensFromBytes(metrics.totals.totalBytes) * 0.18);
	}
}

export const createEmptyTotals = (): IDashboardTotals => ({ ...emptyTotals });
