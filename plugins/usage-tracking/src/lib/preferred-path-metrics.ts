import type { IInvocationOutcome, IUsageTokens } from './types';

export interface IToolInvocationTelemetrySample {
	readonly tool: string;
	readonly outcome: IInvocationOutcome;
	readonly usage?: IUsageTokens | null | undefined;
	readonly durationMs?: number | null | undefined;
}

export interface IToolInvocationTelemetrySummary {
	readonly tool: string;
	readonly calls: number;
	readonly successRate: number;
	readonly averageTokens: number | null;
	readonly averageLatencyMs: number | null;
}

const round = (value: number, decimals: number = 4): number => {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
};

const totalTokensOf = (usage?: IUsageTokens | null): number | null => {
	if (!usage) return null;
	if (typeof usage.totalTokens === 'number') return usage.totalTokens;
	if (
		typeof usage.inputTokens === 'number' ||
		typeof usage.outputTokens === 'number'
	) {
		return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
	}
	return null;
};

export const summarizeToolInvocationTelemetry = (
	samples: readonly IToolInvocationTelemetrySample[],
): readonly IToolInvocationTelemetrySummary[] => {
	const buckets = new Map<
		string,
		{
			calls: number;
			successes: number;
			tokens: number[];
			latencies: number[];
		}
	>();
	for (const sample of samples) {
		const current = buckets.get(sample.tool) ?? {
			calls: 0,
			successes: 0,
			tokens: [],
			latencies: [],
		};
		current.calls += 1;
		if (sample.outcome === 'success') current.successes += 1;
		const totalTokens = totalTokensOf(sample.usage);
		if (typeof totalTokens === 'number' && Number.isFinite(totalTokens)) {
			current.tokens.push(totalTokens);
		}
		if (
			typeof sample.durationMs === 'number' &&
			Number.isFinite(sample.durationMs)
		) {
			current.latencies.push(sample.durationMs);
		}
		buckets.set(sample.tool, current);
	}
	return [...buckets.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([tool, current]) => ({
			tool,
			calls: current.calls,
			successRate: round(current.successes / Math.max(current.calls, 1)),
			averageTokens:
				current.tokens.length === 0
					? null
					: round(
							current.tokens.reduce(
								(sum, value) => sum + value,
								0,
							) / current.tokens.length,
						),
			averageLatencyMs:
				current.latencies.length === 0
					? null
					: round(
							current.latencies.reduce(
								(sum, value) => sum + value,
								0,
							) / current.latencies.length,
						),
		}));
};

export const indexToolInvocationTelemetry = (
	samples: readonly IToolInvocationTelemetrySample[],
): ReadonlyMap<string, IToolInvocationTelemetrySummary> =>
	new Map(
		summarizeToolInvocationTelemetry(samples).map((summary) => [
			summary.tool,
			summary,
		]),
	);
