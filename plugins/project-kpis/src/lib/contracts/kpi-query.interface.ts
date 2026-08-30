import type {
	buildSummary,
	IInvocationRecord,
	IUsageSummary,
	readInvocations,
	readSummary,
} from '@mcp-vertex/usage-tracking/public';

import type { buildKpiSnapshot } from '../services/kpi-aggregation.service';
import type { IKpiHistoryReadResult } from './kpi-history.interface';
import type { IKpiSnapshot } from './kpi-snapshot.interface';

export const PROJECT_KPI_VIEWS = [
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

export type TProjectKpiView = (typeof PROJECT_KPI_VIEWS)[number];

export const KPI_DETAIL_LEVELS = ['compact', 'standard', 'full'] as const;

export type TKpiDetailLevel = (typeof KPI_DETAIL_LEVELS)[number];

export const KPI_DIMENSIONS = [
	'provider',
	'plugin',
	'tool',
	'agent',
	'extension',
	'model',
	'requestType',
	'outcome',
	'error',
	'day',
] as const;

export type TKpiDimension = (typeof KPI_DIMENSIONS)[number];

export const KPI_VIEW_STATUSES = [
	'measured',
	'estimated',
	'partial',
	'unavailable',
	'not-configured',
] as const;

export type TKpiViewStatus = (typeof KPI_VIEW_STATUSES)[number];

export interface IKpiQueryFilter {
	readonly provider?: string;
	readonly plugin?: string;
	readonly tool?: string;
	readonly agent?: string;
	readonly extension?: string;
	readonly model?: string;
	readonly requestType?: string;
	readonly outcome?: 'success' | 'error' | 'timeout' | 'fallback';
	readonly error?: string;
}

export interface IKpiQuery {
	readonly view?: TProjectKpiView;
	readonly from?: string;
	readonly to?: string;
	readonly windowDays?: number;
	readonly limit?: number;
	readonly detail?: TKpiDetailLevel;
	readonly dimensions?: readonly TKpiDimension[];
	readonly filter?: IKpiQueryFilter;
	readonly maxBytes?: number;
}

export interface IProjectKpisToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly cacheDir: string;
	readonly maxBytes: number;
	readonly windowDays: number;
	readonly now?: Date;
	readonly pathExists?: (path: string) => boolean | Promise<boolean>;
	readonly buildKpiSnapshot?: typeof buildKpiSnapshot;
	readonly readUsageSummary?: typeof readSummary;
	readonly readUsageInvocations?: typeof readInvocations;
	readonly buildUsageSummary?: typeof buildSummary;
	readonly readKpiHistoryWindow?: (options: {
		readonly workspaceRootAbs: string;
		readonly cacheDir: string;
		readonly now?: Date;
		readonly from?: string;
		readonly to?: string;
		readonly windowDays?: number;
		readonly limit?: number;
		readonly pathExists?: (path: string) => boolean | Promise<boolean>;
	}) => Promise<IKpiHistoryReadResult>;
	readonly readSnapshot?: (
		query: IKpiQuery,
		options: IProjectKpisToolOptions,
	) => Promise<IKpiSnapshot>;
	readonly readFilteredUsage?: (
		records: readonly IInvocationRecord[],
		windowDays: number,
		nowMs?: number,
	) => IUsageSummary;
}
