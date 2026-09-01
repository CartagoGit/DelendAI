export const KPI_VALUE_STATUSES = [
	'measured',
	'estimated',
	'unavailable',
	'not-configured',
] as const;

export type TKpiValueStatus = (typeof KPI_VALUE_STATUSES)[number];

export const KPI_METRIC_UNITS = [
	'score',
	'count',
	'ratio',
	'tokens',
	'usd',
] as const;

export type TKpiMetricUnit = (typeof KPI_METRIC_UNITS)[number];

export interface IKpiMetric {
	readonly status: TKpiValueStatus;
	readonly unit: TKpiMetricUnit;
	readonly source: string;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiNextAction {
	readonly tool: string;
	readonly reason: string;
}

export interface IKpiTopPlugin {
	readonly plugin: string;
	readonly calls: number;
	readonly errors: number;
	readonly totalTokens: number;
	readonly costUsd: number;
}

export interface IKpiHealthSection {
	readonly status: TKpiValueStatus;
	readonly source: string;
	readonly score: IKpiMetric;
	readonly security: IKpiMetric;
	readonly deps: IKpiMetric;
	readonly quality: IKpiMetric;
	readonly debt: IKpiMetric;
	readonly next: readonly IKpiNextAction[];
	readonly note?: string;
}

export interface IKpiUsageSection {
	readonly status: TKpiValueStatus;
	readonly source: string;
	readonly calls: IKpiMetric;
	readonly errors: IKpiMetric;
	readonly toolErrorRate: IKpiMetric;
	readonly totalTokens: IKpiMetric;
	readonly costUsd: IKpiMetric;
	readonly tokensSaved: IKpiMetric;
	readonly memoryCompactionSavingsTokens: IKpiMetric;
	readonly topPlugins: readonly IKpiTopPlugin[];
	readonly note?: string;
}

export interface IKpiDeliverySection {
	readonly status: TKpiValueStatus;
	readonly source: string;
	readonly note: string;
}

export interface IKpiSnapshot {
	readonly contract: 'project-kpis.snapshot';
	readonly version: 1;
	readonly generatedAt: string;
	readonly windowDays: number;
	readonly health: IKpiHealthSection;
	readonly usage: IKpiUsageSection;
	readonly delivery: IKpiDeliverySection;
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

export interface IKpiAggregationOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly usageSummaryPathAbs: string;
	readonly usageInvocationsPathAbs: string;
	readonly now?: Date;
	readonly windowDays?: number;
	readonly maxBytes?: number;
	readonly pathExists?: (path: string) => boolean | Promise<boolean>;
	readonly readUsageSummary?: (
		absPath: string,
	) => Promise<
		import('@mcp-vertex/usage-tracking/public').IUsageSummary | null
	>;
	readonly readUsageInvocations?: (
		absPath: string,
	) => Promise<
		import('@mcp-vertex/usage-tracking/public').IInvocationRecord[]
	>;
	readonly buildUsageSummary?: (
		records: readonly import('@mcp-vertex/usage-tracking/public').IInvocationRecord[],
		windowDays: number,
		now?: number,
	) => import('@mcp-vertex/usage-tracking/public').IUsageSummary;
	readonly runProjectHealth?: (
		args: import('@mcp-vertex/project-health/public').IProjectHealthToolArgs,
		options: import('@mcp-vertex/project-health/public').IProjectHealthToolOptions,
	) => Promise<{
		readonly content: readonly { readonly text: string }[];
		readonly structuredContent?: Record<string, unknown>;
		readonly isError?: boolean;
	}>;
}
