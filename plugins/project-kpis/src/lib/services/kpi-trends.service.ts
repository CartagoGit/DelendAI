import type {
	IKpiHistoryEntry,
	IKpiHistoryReadResult,
	IKpiTrendMetric,
	IKpiTrendOptions,
	IKpiTrendReport,
	TKpiTrendMetricKey,
	TKpiTrendValueStatus,
} from '../contracts/kpi-history.interface';

const DEFAULT_STABLE_DELTA_PERCENT = 0.01;
const DEFAULT_STABLE_ABSOLUTE_DELTA = 0;

interface ITrendSample {
	readonly at: string;
	readonly status: TKpiTrendValueStatus;
	readonly source: string;
	readonly note?: string;
	readonly value?: number;
}

const asRounded = (value: number): number => Number(value.toFixed(6));

const isReadResult = (
	input: IKpiHistoryReadResult | readonly IKpiHistoryEntry[],
): input is IKpiHistoryReadResult => !Array.isArray(input);

const toSample = (
	at: string,
	status: TKpiTrendValueStatus,
	source: string,
	value?: number,
	note?: string,
): ITrendSample => ({
	at,
	status,
	source,
	...(value !== undefined ? { value } : {}),
	...(note !== undefined ? { note } : {}),
});

const toEntries = (
	input: IKpiHistoryReadResult | readonly IKpiHistoryEntry[],
): readonly IKpiHistoryEntry[] => (isReadResult(input) ? input.entries : input);

const toWindow = (
	input: IKpiHistoryReadResult | readonly IKpiHistoryEntry[],
	windowDays: number,
): IKpiTrendReport['window'] => {
	if (isReadResult(input)) {
		return input.window;
	}
	const first = input[0];
	const last = input.at(-1);
	return {
		from: first?.snapshot.generatedAt ?? new Date(0).toISOString(),
		to: last?.snapshot.generatedAt ?? new Date(0).toISOString(),
		windowDays,
	};
};

const evaluateTrend = (
	key: TKpiTrendMetricKey,
	samples: readonly ITrendSample[],
	options: IKpiTrendOptions,
): IKpiTrendMetric => {
	const latest = samples.at(-1);
	const numericSamples = samples.filter(
		(sample): sample is ITrendSample & { readonly value: number } =>
			typeof sample.value === 'number',
	);
	if (numericSamples.length < 2 || latest === undefined) {
		return {
			key,
			direction: 'unknown',
			status: latest?.status ?? 'unavailable',
			source: latest?.source ?? 'project-kpis/S3',
			sampleCount: samples.length,
			...(latest?.at !== undefined ? { currentAt: latest.at } : {}),
			...(latest?.value !== undefined
				? { currentValue: latest.value }
				: {}),
			note:
				latest?.note ??
				'Need at least two numeric samples in the selected window to compute a trend.',
		};
	}
	const previous = numericSamples[0]!;
	const current = numericSamples[numericSamples.length - 1]!;
	const delta = asRounded(current.value - previous.value);
	const absoluteDelta = Math.abs(delta);
	const stableAbsoluteDelta =
		options.stableAbsoluteDelta ?? DEFAULT_STABLE_ABSOLUTE_DELTA;
	const stableDeltaPercent =
		options.stableDeltaPercent ?? DEFAULT_STABLE_DELTA_PERCENT;
	const deltaPercent =
		previous.value === 0 ? undefined : asRounded(delta / previous.value);
	const stableByPercent =
		deltaPercent !== undefined &&
		Math.abs(deltaPercent) <= stableDeltaPercent;
	const direction =
		absoluteDelta <= stableAbsoluteDelta || stableByPercent
			? 'stable'
			: delta > 0
				? 'up'
				: 'down';
	return {
		key,
		direction,
		status: current.status,
		source: current.source,
		sampleCount: numericSamples.length,
		currentAt: current.at,
		currentValue: current.value,
		previousAt: previous.at,
		previousValue: previous.value,
		delta,
		...(deltaPercent !== undefined ? { deltaPercent } : {}),
		...(current.note !== undefined ? { note: current.note } : {}),
	};
};

const metricSamples = (
	entries: readonly IKpiHistoryEntry[],
	selector: (entry: IKpiHistoryEntry) => ITrendSample,
): ITrendSample[] => entries.map(selector);

export const buildKpiTrendReport = (
	input: IKpiHistoryReadResult | readonly IKpiHistoryEntry[],
	options: IKpiTrendOptions = {},
): IKpiTrendReport => {
	const entries = [...toEntries(input)].sort((left, right) =>
		left.snapshot.generatedAt.localeCompare(right.snapshot.generatedAt),
	);
	const windowDays =
		options.windowDays ??
		(isReadResult(input)
			? input.window.windowDays
			: (entries.at(-1)?.snapshot.windowDays ?? 0));
	return {
		contract: 'project-kpis.trends',
		version: 1,
		window: toWindow(input, windowDays),
		metrics: {
			healthScore: evaluateTrend(
				'health.score',
				metricSamples(entries, (entry) =>
					toSample(
						entry.snapshot.generatedAt,
						entry.snapshot.health.score.status,
						entry.snapshot.health.score.source,
						entry.snapshot.health.score.value,
						entry.snapshot.health.score.note,
					),
				),
				options,
			),
			calls: evaluateTrend(
				'usage.calls',
				metricSamples(entries, (entry) =>
					toSample(
						entry.snapshot.generatedAt,
						entry.snapshot.usage.calls.status,
						entry.snapshot.usage.calls.source,
						entry.snapshot.usage.calls.value,
						entry.snapshot.usage.calls.note,
					),
				),
				options,
			),
			totalTokens: evaluateTrend(
				'usage.totalTokens',
				metricSamples(entries, (entry) =>
					toSample(
						entry.snapshot.generatedAt,
						entry.snapshot.usage.totalTokens.status,
						entry.snapshot.usage.totalTokens.source,
						entry.snapshot.usage.totalTokens.value,
						entry.snapshot.usage.totalTokens.note,
					),
				),
				options,
			),
			costUsd: evaluateTrend(
				'economics.costUsd',
				metricSamples(entries, (entry) =>
					toSample(
						entry.snapshot.generatedAt,
						entry.economics.costUsd.status,
						entry.economics.costUsd.source,
						entry.economics.costUsd.value,
						entry.economics.costUsd.note,
					),
				),
				options,
			),
			tokenSavings: evaluateTrend(
				'economics.tokenSavings',
				metricSamples(entries, (entry) =>
					toSample(
						entry.snapshot.generatedAt,
						entry.economics.tokenSavings.status,
						entry.economics.tokenSavings.source,
						entry.economics.tokenSavings.value,
						entry.economics.tokenSavings.note,
					),
				),
				options,
			),
			financialSavingsUsd: evaluateTrend(
				'economics.financialSavingsUsd',
				metricSamples(entries, (entry) =>
					toSample(
						entry.snapshot.generatedAt,
						entry.economics.financialSavingsUsd.status,
						entry.economics.financialSavingsUsd.source,
						entry.economics.financialSavingsUsd.value,
						entry.economics.financialSavingsUsd.note,
					),
				),
				options,
			),
		},
	};
};
