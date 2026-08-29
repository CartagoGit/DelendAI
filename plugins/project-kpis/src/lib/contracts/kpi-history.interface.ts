import type {
	IKpiMetric,
	IKpiSnapshot,
	TKpiValueStatus,
} from './kpi-snapshot.interface';

export const KPI_HISTORY_ECONOMICS_STATUSES = [
	'provider-reported',
	'configured-estimate',
	'subscription',
	'unavailable',
] as const;

export type TKpiHistoryEconomicsStatus =
	(typeof KPI_HISTORY_ECONOMICS_STATUSES)[number];

export const KPI_TREND_DIRECTIONS = [
	'up',
	'down',
	'stable',
	'unknown',
] as const;

export type TKpiTrendDirection = (typeof KPI_TREND_DIRECTIONS)[number];

export type TKpiTrendValueStatus = TKpiValueStatus | TKpiHistoryEconomicsStatus;

export interface IKpiEconomicsValue {
	readonly status: TKpiHistoryEconomicsStatus;
	readonly unit: 'tokens' | 'usd';
	readonly source: string;
	readonly methodology: string;
	readonly confidence: TKpiValueStatus;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiEconomicsValueInput {
	readonly status: TKpiHistoryEconomicsStatus;
	readonly source: string;
	readonly methodology: string;
	readonly confidence: TKpiValueStatus;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}

export interface IKpiHistoryEconomicsInput {
	readonly costUsd?: IKpiEconomicsValueInput;
	readonly tokenSavings?: IKpiEconomicsValueInput;
	readonly financialSavingsUsd?: IKpiEconomicsValueInput;
}

export interface IKpiHistoryEconomics {
	readonly costUsd: IKpiEconomicsValue;
	readonly tokenSavings: IKpiEconomicsValue;
	readonly financialSavingsUsd: IKpiEconomicsValue;
}

export interface IKpiHistoryEntry {
	readonly snapshot: IKpiSnapshot;
	readonly persistedAt: string;
	readonly economics: IKpiHistoryEconomics;
}

export interface IKpiHistoryStore {
	readonly contract: 'project-kpis.history';
	readonly version: 1;
	readonly updatedAt: string;
	readonly retentionDays: number;
	readonly entries: readonly IKpiHistoryEntry[];
}

export interface IKpiHistoryStorageOptions {
	readonly workspaceRootAbs: string;
	readonly cacheDir: string;
	readonly retentionDays?: number;
	readonly now?: Date;
	readonly pathExists?: (path: string) => boolean | Promise<boolean>;
	readonly readTextFile?: (path: string) => Promise<string>;
	readonly writeTextFileAtomic?: (
		path: string,
		content: string,
	) => Promise<void>;
	readonly withFileMutex?: <T>(
		lockPath: string,
		work: () => Promise<T>,
	) => Promise<T>;
}

export interface IKpiHistoryPersistOptions extends IKpiHistoryStorageOptions {
	readonly snapshot: IKpiSnapshot;
	readonly economics?: IKpiHistoryEconomicsInput;
}

export interface IKpiHistoryPersistResult {
	readonly pathAbs: string;
	readonly stored: IKpiHistoryEntry;
	readonly retainedEntries: number;
	readonly prunedEntries: number;
}

export interface IKpiHistoryReadOptions extends IKpiHistoryStorageOptions {
	readonly from?: string;
	readonly to?: string;
	readonly windowDays?: number;
	readonly limit?: number;
}

export interface IKpiHistoryWindow {
	readonly from: string;
	readonly to: string;
	readonly windowDays: number;
}

export interface IKpiHistoryReadResult {
	readonly pathAbs: string;
	readonly retentionDays: number;
	readonly totalEntries: number;
	readonly window: IKpiHistoryWindow;
	readonly entries: readonly IKpiHistoryEntry[];
}

export type TKpiTrendMetricKey =
	| 'health.score'
	| 'usage.calls'
	| 'usage.totalTokens'
	| 'economics.costUsd'
	| 'economics.tokenSavings'
	| 'economics.financialSavingsUsd';

export interface IKpiTrendMetric {
	readonly key: TKpiTrendMetricKey;
	readonly direction: TKpiTrendDirection;
	readonly status: TKpiTrendValueStatus;
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

export interface IKpiTrendReport {
	readonly contract: 'project-kpis.trends';
	readonly version: 1;
	readonly window: IKpiHistoryWindow;
	readonly metrics: {
		readonly healthScore: IKpiTrendMetric;
		readonly calls: IKpiTrendMetric;
		readonly totalTokens: IKpiTrendMetric;
		readonly costUsd: IKpiTrendMetric;
		readonly tokenSavings: IKpiTrendMetric;
		readonly financialSavingsUsd: IKpiTrendMetric;
	};
}

export interface IKpiTrendOptions {
	readonly windowDays?: number;
	readonly stableDeltaPercent?: number;
	readonly stableAbsoluteDelta?: number;
}

export interface IKpiHistoryMetricBinding {
	readonly metric: IKpiMetric;
	readonly fallbackStatus: TKpiHistoryEconomicsStatus;
	readonly unavailableMethodology: string;
}
