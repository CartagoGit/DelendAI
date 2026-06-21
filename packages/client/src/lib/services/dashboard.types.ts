/**
 * Typed models consumed by the dashboard webview. Every dashboard panel
 * receives one of these; no `any`, no `unknown` escapes this surface.
 *
 * Derived from the existing MCP tool outputs (`mcp-vertex_overview`,
 * `mcp-vertex_metrics`, `proposals_proposal_board`,
 * `proposals_compact_status`, `proposals_agent_names`,
 * `mcp-vertex_knowledge`) — never invent fields that aren't already on
 * the server.
 */
import type { IHealthSnapshot } from './health.types';
import type { IOverview } from './tool-descriptor.types';

/** Tool-call metric as recorded by `<prefix>_metrics`. */
export interface IToolMetricRow {
	readonly tool: string;
	readonly plugin: string;
	readonly calls: number;
	readonly errors: number;
	readonly totalMs: number;
	readonly maxMs: number;
	readonly avgMs: number;
	readonly totalBytes: number;
	readonly tokens: number;
}

/** Aggregate KPIs for the header strip of the dashboard. */
export interface IDashboardTotals {
	readonly tools: number;
	readonly plugins: number;
	readonly proposals: number;
	readonly calls: number;
	readonly errors: number;
	readonly totalMs: number;
	readonly tokens: number;
	readonly tokensSaved: number;
	readonly savingsPercent: number;
	readonly agents: number;
}

/** Overview model — server identity, plugin list, recommended next action. */
export interface IDashboardOverviewModel {
	readonly serverName: string;
	readonly serverVersion: string;
	readonly namespacePrefix: string;
	readonly plugins: readonly {
		readonly name: string;
		readonly version?: string;
	}[];
	readonly tools: readonly {
		readonly name: string;
		readonly plugin: string;
	}[];
	readonly knowledgeIds: readonly string[];
	readonly recommendedNextAction: string;
	readonly totals: IDashboardTotals;
}

/** Per-tool metrics, sorted by calls desc, with sparkline samples. */
export interface IDashboardMetricsModel {
	readonly totals: {
		readonly calls: number;
		readonly errors: number;
		readonly totalMs: number;
		readonly totalBytes: number;
	};
	readonly rows: readonly IToolMetricRow[];
	/** Per-tool rolling samples (latest last); max 60 entries each. */
	readonly sparklines: Readonly<Record<string, readonly number[]>>;
	readonly collectedAt: string;
}

/** Tokens used vs tokens saved (compact-vs-full vs cumulative). */
export interface IDashboardTokensModel {
	readonly tokensUsed: number;
	readonly tokensSaved: number;
	readonly savingsPercent: number;
	readonly topByTokens: readonly IToolMetricRow[];
	readonly history: readonly {
		readonly at: string;
		readonly tokens: number;
	}[];
}

/** Sortable table for the Tools panel. */
export interface IDashboardToolsModel {
	readonly rows: readonly IToolMetricRow[];
	readonly sortBy: 'calls' | 'errors' | 'avgMs' | 'tokens';
	readonly sortDir: 'asc' | 'desc';
}

/** Per-plugin rollup. */
export interface IDashboardPluginsModel {
	readonly rows: readonly {
		readonly plugin: string;
		readonly tools: number;
		readonly calls: number;
		readonly errors: number;
		readonly avgMs: number;
		readonly tokens: number;
		readonly tokenSharePercent: number;
	}[];
}

/** Active sessions — proposals in flight. */
export interface IDashboardSessionsModel {
	readonly total: number;
	readonly byStatus: Readonly<Record<string, number>>;
	readonly rows: readonly {
		readonly id: string;
		readonly title: string;
		readonly status: string;
		readonly track: string;
		readonly agent?: string;
		readonly slice?: string;
	}[];
}

/** Latency summary. */
export interface IDashboardTimesModel {
	readonly totalWallMs: number;
	readonly slowestTool?: { readonly tool: string; readonly maxMs: number };
	readonly p50Ms: number;
	readonly p95Ms: number;
	readonly histogram: readonly {
		readonly bucket: string;
		readonly count: number;
	}[];
}

/** Active agents (from `proposals_agent_names`). */
export interface IDashboardAgentsModel {
	readonly agents: readonly {
		readonly name: string;
		readonly currentProposal?: string;
		readonly currentSlice?: string;
		readonly lockHeld?: string;
		readonly lastHeartbeat?: string;
	}[];
	readonly totalActive: number;
}

/** One round-trip from `DashboardService.getAllModels`. */
export interface IDashboardAllModels {
	readonly overview: IDashboardOverviewModel;
	readonly metrics: IDashboardMetricsModel;
	readonly tokens: IDashboardTokensModel;
	readonly tools: IDashboardToolsModel;
	readonly plugins: IDashboardPluginsModel;
	readonly sessions: IDashboardSessionsModel;
	readonly times: IDashboardTimesModel;
	readonly agents: IDashboardAgentsModel;
	readonly health: IHealthSnapshot;
	readonly server: {
		readonly name: string;
		readonly version: string;
		readonly fetchedAt: string;
	};
}

/** Source types — what the dashboard reads from the server. */
export interface IDashboardSourceOverview {
	readonly overview: IOverview;
	readonly metrics?: Readonly<Record<string, IToolMetricRow>>;
}

export interface IDashboardSourceProposals {
	readonly proposals: readonly {
		readonly id: string;
		readonly title: string;
		readonly status: string;
		readonly track: string;
	}[];
}

export interface IDashboardSourceAgents {
	readonly agents: readonly string[];
}
