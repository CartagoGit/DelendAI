import type {
	IInvocationRecord,
	IUsageSummary,
} from '@mcp-vertex/usage-tracking/public';

import type { IKpiTrendReport } from '../contracts/kpi-history.interface';
import type { IKpiSnapshot } from '../contracts/kpi-snapshot.interface';

/** Extended invocation shape carrying the latency field read from telemetry. */
interface IKpiEfficiencyRecord extends IInvocationRecord {
	readonly latencyMs?: number | null;
}

type TKpiEfficiencyStatus =
	| 'measured'
	| 'estimated'
	| 'partial'
	| 'unavailable'
	| 'not-configured';

type TKpiEfficiencyCausality = 'measured' | 'inferred' | 'unknown';

interface IEfficiencyObservation {
	readonly calls: number;
	readonly successfulCalls: number;
	readonly failedCalls: number;
	readonly successRate: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly tokensSaved: number;
	readonly averageLatencyMs: number | null;
	readonly tokensPerCall: number | null;
	readonly costPerCall: number | null;
	readonly utilityPer1kTokens: number | null;
}

interface IEfficiencyBaseline {
	readonly configured: boolean;
	readonly source: string;
	readonly manualHours?: number;
	readonly manualCostUsd?: number;
	readonly note?: string;
}

interface IEfficiencySavingsItem {
	readonly id: string;
	readonly kind: 'tokens' | 'usd';
	readonly basis: string;
	readonly value?: number;
	readonly causality: TKpiEfficiencyCausality;
	readonly methodology: string;
	readonly confidence: TKpiEfficiencyCausality;
	readonly note?: string;
}

interface IEfficiencyAnalysisWindow {
	readonly from: string;
	readonly to: string;
	readonly windowDays: number;
}

interface IEfficiencyAnalysis {
	readonly contract: 'project-kpis.efficiency';
	readonly version: 1;
	readonly generatedAt: string;
	readonly status: TKpiEfficiencyStatus;
	readonly source: string;
	readonly window: IEfficiencyAnalysisWindow;
	readonly observations: IEfficiencyObservation;
	readonly baseline: IEfficiencyBaseline;
	readonly savings: readonly IEfficiencySavingsItem[];
	readonly causality: TKpiEfficiencyCausality;
	readonly note?: string;
}

interface IEfficiencyAnalysisOptions {
	readonly snapshot: IKpiSnapshot;
	readonly trend: IKpiTrendReport;
	readonly summary: IUsageSummary | null;
	readonly records: readonly IKpiEfficiencyRecord[];
	readonly baseline?: {
		readonly manualHoursPerTask?: number;
		readonly taskCount?: number;
		readonly developerHourlyCostUsd?: number;
		readonly manualCostUsd?: number;
	} | null;
	readonly window: IEfficiencyAnalysisWindow;
	readonly now?: Date;
}

const round = (value: number): number => Number(value.toFixed(6));
const asIsoString = (value: Date): string => value.toISOString();

const baselineOf = (
	baseline: NonNullable<IEfficiencyAnalysisOptions['baseline']> | null,
): IEfficiencyBaseline => {
	if (baseline === undefined || baseline === null) {
		return {
			configured: false,
			source: 'no baseline configured',
			note: 'Provide a manual-effort baseline to unlock financial savings estimates.',
		};
	}
	if (baseline.manualCostUsd !== undefined) {
		return {
			configured: true,
			source: 'configured manual cost',
			...(baseline.manualCostUsd !== undefined
				? { manualCostUsd: baseline.manualCostUsd }
				: {}),
		};
	}
	const manualHours =
		baseline.manualHoursPerTask !== undefined &&
		baseline.taskCount !== undefined
			? baseline.manualHoursPerTask * baseline.taskCount
			: undefined;
	const manualCostUsd =
		manualHours !== undefined &&
		baseline.developerHourlyCostUsd !== undefined
			? manualHours * baseline.developerHourlyCostUsd
			: undefined;
	if (manualHours === undefined || manualCostUsd === undefined) {
		return {
			configured: false,
			source: 'incomplete baseline',
			note: 'The manual-effort baseline is incomplete (needs manualHoursPerTask + taskCount + developerHourlyCostUsd, or manualCostUsd).',
		};
	}
	return {
		configured: true,
		source: 'configured manual-effort estimate',
		manualHours,
		manualCostUsd,
	};
};

const observationsOf = (
	summary: IUsageSummary | null,
	records: readonly IKpiEfficiencyRecord[],
): IEfficiencyObservation => {
	const calls = records.length;
	const successfulCalls = records.reduce(
		(acc, record) => acc + (record.outcome === 'success' ? 1 : 0),
		0,
	);
	const failedCalls = calls - successfulCalls;
	const totalTokens = records.reduce(
		(acc, record) =>
			acc +
			(record.usage?.totalTokens ??
				(record.usage?.inputTokens ?? 0) +
					(record.usage?.outputTokens ?? 0)),
		0,
	);
	const costUsd = round(
		records.reduce((acc, record) => acc + (record.costUsd ?? 0), 0),
	);
	const tokensSaved = records.reduce(
		(acc, record) => acc + (record.tokensSaved ?? 0),
		0,
	);
	const latencies = records
		.map((record) => record.latencyMs ?? record.durationMs)
		.filter(
			(value): value is number =>
				typeof value === 'number' && Number.isFinite(value),
		);
	const averageLatencyMs =
		latencies.length === 0
			? null
			: round(
					latencies.reduce((acc, value) => acc + value, 0) /
						latencies.length,
				);
	const tokensPerCall = calls > 0 ? round(totalTokens / calls) : null;
	const costPerCall = calls > 0 ? round(costUsd / calls) : null;
	const utilityValues =
		summary === null
			? []
			: summary.pluginKpis
					.map((plugin) => plugin.utilityPer1kTokens)
					.filter((value) => Number.isFinite(value));
	const utilityPer1kTokens =
		utilityValues.length === 0
			? null
			: round(
					utilityValues.reduce((acc, value) => acc + value, 0) /
						utilityValues.length,
				);
	return {
		calls,
		successfulCalls,
		failedCalls,
		successRate: calls > 0 ? round(successfulCalls / calls) : 0,
		totalTokens,
		costUsd,
		tokensSaved,
		averageLatencyMs,
		tokensPerCall,
		costPerCall,
		utilityPer1kTokens,
	};
};

const savingsOf = (
	observations: IEfficiencyObservation,
	baseline: IEfficiencyBaseline,
): readonly IEfficiencySavingsItem[] => {
	const savings: IEfficiencySavingsItem[] = [];
	if (observations.tokensSaved > 0) {
		savings.push({
			id: 'token-savings',
			kind: 'tokens',
			basis: 'provider/usage-tracking tokensSaved rollup',
			value: observations.tokensSaved,
			causality: 'measured',
			methodology:
				'Sum of per-invocation tokensSaved reported by usage-tracking; direct local observation.',
			confidence: 'measured',
		});
	}
	if (
		baseline.manualCostUsd !== undefined &&
		observations.costUsd !== undefined
	) {
		const financialSavingsUsd = round(
			Math.max(0, baseline.manualCostUsd - observations.costUsd),
		);
		savings.push({
			id: 'manual-baseline-financial-savings',
			kind: 'usd',
			basis: 'configured manual-effort baseline vs observed MCP spend',
			value: financialSavingsUsd,
			causality: 'inferred',
			methodology:
				'Configured manual baseline minus observed provider-reported cost; the counterfactual manual execution was not run, so the saving is an inference.',
			confidence: 'inferred',
		});
	}
	return savings;
};

/**
 * Compare configured baselines against observed MCP-assisted usage and label
 * each saving with a causality (measured / inferred / unknown). Never invents
 * provider prices or savings: token savings only come from the usage-tracking
 * rollup and financial savings only from an explicit configured baseline.
 */
export const buildEfficiencyAnalysis = (
	options: IEfficiencyAnalysisOptions,
): IEfficiencyAnalysis => {
	const now = options.now ?? new Date();
	const generatedAt = asIsoString(now);
	const baseline = baselineOf(options.baseline ?? null);
	const observations = observationsOf(options.summary, options.records);
	const savings = savingsOf(observations, baseline);

	const hasObserved =
		observations.calls > 0 ||
		observations.totalTokens > 0 ||
		observations.tokensSaved > 0;
	const status: TKpiEfficiencyStatus =
		observations.calls > 0
			? 'measured'
			: observations.totalTokens > 0
				? 'partial'
				: hasObserved
					? 'estimated'
					: baseline.configured
						? 'partial'
						: 'not-configured';
	const causality: TKpiEfficiencyCausality = savings.some(
		(item) => item.causality === 'measured',
	)
		? 'measured'
		: savings.some((item) => item.causality === 'inferred')
			? 'inferred'
			: 'unknown';

	return {
		contract: 'project-kpis.efficiency',
		version: 1,
		generatedAt,
		status,
		source: 'project-kpis/S7',
		window: options.window,
		observations,
		baseline,
		savings,
		causality,
		...(savings.length === 0
			? {
					note: 'No savings were reported because neither a provider/usage rollup source nor a configured baseline produced evidence.',
				}
			: {}),
	};
};
