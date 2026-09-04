/**
 * Typed models consumed by the dashboard webview. Every dashboard panel
 * receives one of these; no `any`, no `unknown` escapes this surface.
 *
 * Derived from the existing MCP tool outputs (`delendai_overview`,
 * `delendai_metrics`, `delendai_proposals_proposal_board`,
 * `delendai_proposals_compact_status`, `delendai_proposals_agent_names`,
 * `delendai_knowledge`) — never invent fields that aren't already on
 * the server.
 */
import type { IHealthSnapshot } from './health.interface';
import type { IMemoryListEntry } from './memory.interface';
import type { IOverview } from './tool-descriptor.interface';

/**
 * Lifecycle state shared by dashboard data sources.
 *
 * `loading` means the state container is present before the MCP round-trip
 * finishes; callers must branch on `state` and treat the accompanying data as
 * a structural placeholder, not as real server payload.
 */
export type IDashboardDataState = 'ready' | 'empty' | 'loading' | 'unavailable';

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

/**
 * Real spend/cost telemetry, sourced from usage-tracking's
 * `usage_report` (f00118 S1) — `null` when the plugin is not loaded or
 * the call fails (graceful degradation; the byte-based
 * `IDashboardTokensModel` estimate stays the fallback everywhere).
 */
export interface IDashboardSpendModel {
	readonly totalCostUsd: number;
	readonly totalTokensSaved: number;
	readonly savingsPercent: number;
	readonly windowDays: number;
	readonly byProvider: readonly {
		readonly provider: string;
		readonly costUsd: number;
		readonly calls: number;
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

/** Active agents (from `delendai_proposals_agent_names`). */
export interface IDashboardAgentsModel {
	readonly agents: readonly {
		readonly name: string;
		readonly currentProposal?: string | { readonly id: string };
		readonly currentSlice?: string;
		readonly lockHeld?: string;
		readonly lastHeartbeat?: string;
	}[];
	readonly totalActive: number;
}

/**
 * Durable memory notes exposed by the server's memory plugin.
 *
 * Lifecycle state belongs to the workspace section wrapper so legacy
 * consumers can keep treating this as a plain data snapshot.
 */
export interface IDashboardMemoryModel {
	readonly state?: IDashboardDataState;
	readonly notes: readonly IMemoryListEntry[];
	readonly total: number;
	readonly offset: number;
	readonly nextOffset?: number;
}

/** Summary of docs-facing workspace context derived from overview. */
export interface IDashboardDocsModel {
	readonly pluginLoaded: boolean;
	readonly tools: readonly string[];
	readonly knowledge: readonly {
		readonly id: string;
		readonly title?: string;
	}[];
	readonly recommendedNextAction: string;
}

/** Header KPI rollup derived from existing dashboard models. */
export interface IDashboardKpisModel {
	readonly totals: IDashboardTotals;
	readonly tokens: {
		readonly used: number;
		readonly saved: number;
		readonly savingsPercent: number;
	};
	readonly latency: {
		readonly totalWallMs: number;
		readonly p50Ms: number;
		readonly p95Ms: number;
	};
	readonly spend: IDashboardSpendModel | null;
}

/**
 * State-bearing workspace section used by the dashboard shell.
 *
 * During `loading`, `data` preserves the section shape for compatibility but
 * does not represent fetched server data yet.
 */
export interface IDashboardWorkspaceSection<T> {
	readonly state: IDashboardDataState;
	readonly data: T;
}

/** Complete dashboard workspace model, grouped by panel/section. */
export interface IDashboardWorkspaceModel {
	readonly overview: IDashboardWorkspaceSection<IDashboardOverviewModel>;
	readonly tools: IDashboardWorkspaceSection<IDashboardToolsModel>;
	readonly plugins: IDashboardWorkspaceSection<IDashboardPluginsModel>;
	readonly memory: IDashboardWorkspaceSection<IDashboardMemoryModel>;
	readonly proposals: IDashboardWorkspaceSection<IDashboardSessionsModel>;
	readonly agents: IDashboardWorkspaceSection<IDashboardAgentsModel>;
	readonly kpis: IDashboardWorkspaceSection<IDashboardKpisModel>;
	readonly health: IDashboardWorkspaceSection<IHealthSnapshot>;
	readonly docs: IDashboardWorkspaceSection<IDashboardDocsModel>;
}

/** One round-trip from `DashboardService.getAllModels`. */
export interface IDashboardAllModels {
	readonly overview: IDashboardOverviewModel;
	readonly metrics: IDashboardMetricsModel;
	readonly tokens: IDashboardTokensModel;
	readonly tools: IDashboardToolsModel;
	readonly plugins: IDashboardPluginsModel;
	readonly proposals: IDashboardSessionsModel;
	readonly kpis: IDashboardKpisModel;
	readonly docs: IDashboardDocsModel;
	/** `null` when usage-tracking is not loaded or unreachable. */
	readonly spend: IDashboardSpendModel | null;
	readonly sessions: IDashboardSessionsModel;
	readonly times: IDashboardTimesModel;
	readonly agents: IDashboardAgentsModel;
	readonly memory: IDashboardMemoryModel;
	readonly health: IHealthSnapshot;
	readonly workspace: IDashboardWorkspaceModel;
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
