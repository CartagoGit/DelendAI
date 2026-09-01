import type { McpStdioClient } from '@mcp-vertex/client';
import type {
	IKpiDashboardModel,
	IKpiDashboardRecommendation,
	TKpiDashboardMetricUnit,
} from '../../../../../packages/ui-extension/src/kpi-dashboard';
import type {
	IHostAdapter,
	IWebviewPanel,
	IWebviewViewProvider,
} from '@mcp-vertex/ui-extension/public';
import type { z } from 'zod';

import type { KPI_DASHBOARD_MESSAGE_SCHEMA } from '../constants/kpi-dashboard-message-schema.constant';

export type {
	IKpiDashboardMetric,
	IKpiDashboardModel,
	IKpiDashboardRecommendation,
	IKpiDashboardRow,
	IKpiDashboardSection,
	IKpiDashboardTrendCard,
	TKpiDashboardMetricStatus,
	TKpiDashboardMetricUnit,
	TKpiDashboardViewState,
} from '../../../../../packages/ui-extension/src/kpi-dashboard';

export const KPI_DASHBOARD_WINDOW_OPTIONS = [7, 30, 90] as const;

export type TKpiDashboardWindowDays =
	(typeof KPI_DASHBOARD_WINDOW_OPTIONS)[number];

export const KPI_DASHBOARD_VIEWS = [
	'summary',
	'history',
	'usage',
	'economics',
	'models',
	'agents',
	'plugins',
	'errors',
	'efficiency',
	'audit',
	'activation',
] as const;

export type TKpiDashboardViewName = (typeof KPI_DASHBOARD_VIEWS)[number];

export type TKpiDashboardDetail = 'compact' | 'standard' | 'full';

export interface IKpiDashboardToolSource {
	readonly id: string;
	readonly kind:
		| 'snapshot'
		| 'history'
		| 'trend'
		| 'usage-summary'
		| 'invocations'
		| 'activation-kpis';
	readonly status: string;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiDashboardToolDisplayMetric {
	readonly key: string;
	readonly label: string;
	readonly status: string;
	readonly unit: TKpiDashboardMetricUnit;
	readonly source: string;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiDashboardToolTrendMetric {
	readonly key: string;
	readonly label: string;
	readonly direction: 'up' | 'down' | 'stable' | 'unknown';
	readonly status: string;
	readonly source: string;
	readonly sampleCount: number;
	readonly currentAt?: string;
	readonly currentValue?: number;
	readonly previousAt?: string;
	readonly previousValue?: number;
	readonly delta?: number;
	readonly deltaPercent?: number;
	readonly note?: string;
}

export interface IKpiDashboardToolHistoryEntry {
	readonly generatedAt: string;
	readonly persistedAt: string;
	readonly healthScore?: number;
	readonly calls?: number;
	readonly totalTokens?: number;
	readonly costUsdStatus: string;
	readonly costUsd?: number;
	readonly tokenSavingsStatus: string;
	readonly tokenSavings?: number;
	readonly financialSavingsUsdStatus: string;
	readonly financialSavingsUsd?: number;
	readonly note?: string;
}

export interface IKpiDashboardToolBreakdownItem {
	readonly key: string;
	readonly status: string;
	readonly calls?: number;
	readonly successfulCalls?: number;
	readonly failedCalls?: number;
	readonly errors?: number;
	readonly totalTokens?: number;
	readonly costUsd?: number;
	readonly tokensSaved?: number;
	readonly averageLatencyMs?: number | null;
	readonly utilityPer1kTokens?: number;
	readonly lastSeenAt?: string | null;
	readonly note?: string;
}

export interface IKpiDashboardToolBreakdown {
	readonly dimension:
		| 'provider'
		| 'plugin'
		| 'tool'
		| 'agent'
		| 'extension'
		| 'model'
		| 'requestType'
		| 'outcome'
		| 'error'
		| 'day';
	readonly status: string;
	readonly source: string;
	readonly totalItems: number;
	readonly items: readonly IKpiDashboardToolBreakdownItem[];
	readonly note?: string;
}

export interface IKpiDashboardToolIssue {
	readonly ts: string;
	readonly plugin: string;
	readonly tool: string;
	readonly requestType: string;
	readonly outcome: string;
	readonly classification: string;
	readonly correlationId: string | null;
	readonly message: string;
	readonly incongruence: boolean;
	readonly iteration: number | null;
}

export interface IKpiDashboardToolFinding {
	readonly id: string;
	readonly severity: 'info' | 'warning' | 'error';
	readonly status: string;
	readonly summary: string;
	readonly evidence: string;
	readonly recommendation?: string;
}

export interface IKpiDashboardToolOutput {
	readonly contract: 'project-kpis.view';
	readonly version: 1;
	readonly view: TKpiDashboardViewName;
	readonly detail: TKpiDashboardDetail;
	readonly status: string;
	readonly generatedAt: string;
	readonly window: {
		readonly from: string;
		readonly to: string;
		readonly windowDays: number;
		readonly limit: number;
	};
	readonly dimensions: readonly string[];
	readonly filter: {
		readonly provider?: string;
		readonly plugin?: string;
		readonly tool?: string;
		readonly agent?: string;
		readonly extension?: string;
		readonly model?: string;
		readonly requestType?: string;
		readonly outcome?: 'success' | 'error' | 'timeout' | 'fallback';
		readonly error?: string;
	};
	readonly summary: string;
	readonly sources: readonly IKpiDashboardToolSource[];
	readonly privacy: {
		readonly observedMcpOnly: boolean;
		readonly limitations: readonly string[];
	};
	readonly recommendations: readonly IKpiDashboardRecommendation[];
	readonly snapshot?: {
		readonly status: string;
		readonly source: string;
		readonly generatedAt: string;
		readonly windowDays: number;
		readonly highlights: readonly IKpiDashboardToolDisplayMetric[];
		readonly note?: string;
	};
	readonly history?: {
		readonly status: string;
		readonly source: string;
		readonly entries: readonly IKpiDashboardToolHistoryEntry[];
		readonly trends: readonly IKpiDashboardToolTrendMetric[];
		readonly note?: string;
	};
	readonly breakdowns?: readonly IKpiDashboardToolBreakdown[];
	readonly issues?: {
		readonly status: string;
		readonly source: string;
		readonly items: readonly IKpiDashboardToolIssue[];
		readonly note?: string;
	};
	readonly findings?: {
		readonly status: string;
		readonly source: string;
		readonly items: readonly IKpiDashboardToolFinding[];
		readonly note?: string;
	};
	readonly activation?: {
		readonly status: string;
		readonly source: string;
		readonly sessionCount: number;
		readonly meanPrecision?: number;
		readonly meanRecall?: number;
		readonly meanChurn?: number;
		readonly note?: string;
	};
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

export interface IKpiDashboardQuery {
	readonly windowDays: TKpiDashboardWindowDays;
	readonly detail: TKpiDashboardDetail;
}

export interface IKpiDashboardProviderDeps {
	readonly host: Pick<IHostAdapter, 'registerWebviewViewProvider'>;
	readonly client: Pick<McpStdioClient, 'request'>;
	readonly serverConfigured?: boolean;
	readonly namespacePrefix?: string;
	readonly viewId?: string;
	readonly defaultQuery?: Partial<IKpiDashboardQuery>;
}

export interface IKpiDashboardRuntimeDeps {
	readonly client: Pick<McpStdioClient, 'request'>;
	readonly namespacePrefix?: string;
	readonly query: IKpiDashboardQuery;
}

export interface IKpiDashboardLoadedView {
	readonly view: TKpiDashboardViewName;
	readonly output?: IKpiDashboardToolOutput;
	readonly error?: string;
	readonly disconnected?: boolean;
}

export interface IKpiDashboardResolvedState {
	readonly query: IKpiDashboardQuery;
	readonly model: IKpiDashboardModel;
	readonly loadedViews: readonly IKpiDashboardLoadedView[];
}

export interface IKpiDashboardProvider extends IWebviewViewProvider {
	refresh(): Promise<void>;
	getState(): IKpiDashboardResolvedState | undefined;
	resolveWebviewView(webview: IWebviewPanel): Promise<void>;
}

export type KpiDashboardMessage = z.infer<typeof KPI_DASHBOARD_MESSAGE_SCHEMA>;
