import { BYTES_PER_TOKEN } from './contracts/constants/bytes-per-token.constant';
import { percentile } from './statistics.helper';
import { buildTokenTax } from './token-tax.helper';
import type { IInvocationRecord, IUsageSummary } from './types';

const HOURS_PER_DAY = 24;
const DAY_MS = HOURS_PER_DAY * 60 * 60 * 1000;
const MIN_OBSERVED_WINDOW_DAYS = 1 / HOURS_PER_DAY;

const round = (value: number, decimals: number = 4): number => {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
};

const responseBytesOf = (records: readonly IInvocationRecord[]): number[] =>
	records
		.map((record) => record.responseBytes)
		.filter((value): value is number => typeof value === 'number');

const latencyMsOf = (records: readonly IInvocationRecord[]): number[] =>
	records
		.map((record) => record.durationMs)
		.filter((value): value is number => typeof value === 'number');

const successfulCallsOf = (records: readonly IInvocationRecord[]): number =>
	records.reduce(
		(count, record) => count + (record.outcome === 'success' ? 1 : 0),
		0,
	);

const distinctSessionsOf = (records: readonly IInvocationRecord[]): number =>
	new Set(records.map((record) => record.sessionId)).size;

const byPluginRecords = (
	records: readonly IInvocationRecord[],
): Map<string, IInvocationRecord[]> => {
	const map = new Map<string, IInvocationRecord[]>();
	for (const record of records) {
		const current = map.get(record.plugin) ?? [];
		current.push(record);
		map.set(record.plugin, current);
	}
	return map;
};

const utilityPer1kTokensOf = (
	successContribution: number,
	contextBytes: number,
): number => {
	if (successContribution <= 0 || contextBytes <= 0) return 0;
	return round(
		successContribution / (contextBytes / (1_000 * BYTES_PER_TOKEN)),
	);
};

const invocationRatePerDayOf = (calls: number, windowDays: number): number =>
	round(calls / Math.max(windowDays, 1), 4);

const observedWindowDaysOf = (
	records: readonly IInvocationRecord[],
	windowDays: number,
): number => {
	const timestamps = records
		.map((record) => Date.parse(record.ts))
		.filter((value) => !Number.isNaN(value))
		.sort((left, right) => left - right);
	if (timestamps.length < 2) return Math.max(windowDays, 1);
	const elapsedDays = (timestamps.at(-1)! - timestamps[0]!) / DAY_MS;
	return Math.max(
		Math.min(windowDays, elapsedDays),
		MIN_OBSERVED_WINDOW_DAYS,
	);
};

export const summarizeLocalKpis = (
	records: readonly IInvocationRecord[],
	windowDays: number,
): Pick<IUsageSummary, 'pluginKpis' | 'kpis'> => {
	const totalSuccessfulCalls = successfulCallsOf(records);
	const totalSessions = distinctSessionsOf(records);
	const observedWindowDays = observedWindowDaysOf(records, windowDays);
	const pluginKpis = [...byPluginRecords(records).entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([plugin, pluginRecords]) => {
			const tokenTax = buildTokenTax(plugin, pluginRecords);
			const pluginSuccessfulCalls = successfulCallsOf(pluginRecords);
			const successContribution =
				totalSuccessfulCalls === 0
					? 0
					: round(pluginSuccessfulCalls / totalSuccessfulCalls);
			const responseBytes = responseBytesOf(pluginRecords);
			const latencyMs = latencyMsOf(pluginRecords);
			const observedSessions = distinctSessionsOf(pluginRecords);
			const activationRate =
				totalSessions === 0
					? null
					: round(observedSessions / totalSessions);
			const dynamicActivationSavingsBytes =
				totalSessions === 0
					? null
					: Math.max(0, totalSessions - observedSessions) *
						tokenTax.staticSchemaBytes;
			const memoryCompactionSavingsTokens = pluginRecords.reduce(
				(total, record) => total + (record.tokensSaved ?? 0),
				0,
			);

			return {
				plugin,
				observedCalls: pluginRecords.length,
				observedSessions,
				tokenTax,
				utilityPer1kTokens: utilityPer1kTokensOf(
					successContribution,
					tokenTax.totalBytes,
				),
				kpis: {
					schemaBytes: tokenTax.staticSchemaBytes,
					invocationRatePerDay: invocationRatePerDayOf(
						pluginRecords.length,
						observedWindowDays,
					),
					successContribution,
					responseBytesP50: percentile(responseBytes, 0.5),
					responseBytesP95: percentile(responseBytes, 0.95),
					latencyMsP50: percentile(latencyMs, 0.5),
					latencyMsP95: percentile(latencyMs, 0.95),
					toolErrorRate: round(
						pluginRecords.reduce(
							(count, record) =>
								count + (record.outcome === 'success' ? 0 : 1),
							0,
						) / Math.max(pluginRecords.length, 1),
					),
					pluginActivationRate: activationRate,
					dynamicActivationSavingsBytes,
					memoryCompactionSavingsTokens,
					contextRehydrationEffectiveness: null,
					contextRehydrationEffectivenessNote:
						'usage-tracking does not record a resume-success signal after rehydration; only raw invocation metadata is available locally.',
					privacyGateBlockedReportCount: null,
					privacyGateBlockedReportCountNote:
						'usage-tracking does not currently emit a local blocked-report counter, so this KPI remains intentionally null.',
				},
			};
		});

	const responseBytes = responseBytesOf(records);
	const latencyMs = latencyMsOf(records);
	const totalStaticSchemaBytes = pluginKpis.reduce(
		(total, plugin) => total + plugin.tokenTax.staticSchemaBytes,
		0,
	);
	const totalDynamicActivationSavingsBytes = pluginKpis.reduce(
		(total, plugin) =>
			total + (plugin.kpis.dynamicActivationSavingsBytes ?? 0),
		0,
	);
	const averagePluginActivationRate =
		pluginKpis.length === 0
			? null
			: round(
					pluginKpis.reduce(
						(total, plugin) =>
							total + (plugin.kpis.pluginActivationRate ?? 0),
						0,
					) / pluginKpis.length,
				);
	const memoryCompactionSavingsTokens = records.reduce(
		(total, record) => total + (record.tokensSaved ?? 0),
		0,
	);

	return {
		pluginKpis,
		kpis: {
			coldStartCostBytes: totalStaticSchemaBytes,
			coldStartCostTokens: Math.ceil(
				totalStaticSchemaBytes / BYTES_PER_TOKEN,
			),
			coldStartCostNote:
				'Derived from observed plugins only. Unloaded or never-invoked plugins are intentionally invisible to this local aggregate.',
			invocationRatePerDay: invocationRatePerDayOf(
				records.length,
				observedWindowDays,
			),
			successfulCallRate: round(
				totalSuccessfulCalls / Math.max(records.length, 1),
			),
			responseBytesP50: percentile(responseBytes, 0.5),
			responseBytesP95: percentile(responseBytes, 0.95),
			latencyMsP50: percentile(latencyMs, 0.5),
			latencyMsP95: percentile(latencyMs, 0.95),
			toolErrorRate: round(
				records.reduce(
					(count, record) =>
						count + (record.outcome === 'success' ? 0 : 1),
					0,
				) / Math.max(records.length, 1),
			),
			averagePluginActivationRate,
			dynamicActivationSavingsBytes:
				pluginKpis.length === 0
					? null
					: totalDynamicActivationSavingsBytes,
			memoryCompactionSavingsTokens,
			memoryCompactionSavingsNote:
				'Summed from locally stamped tokensSaved counters only; usage-tracking never inspects prompts, args or outputs.',
			contextRehydrationEffectiveness: null,
			contextRehydrationEffectivenessNote:
				'No local signal links a rehydration event to subsequent task success, so this KPI remains intentionally null.',
			privacyGateBlockedReportCount: null,
			privacyGateBlockedReportCountNote:
				'No local blocked-report counter is emitted today, so this KPI remains intentionally null.',
		},
	};
};
