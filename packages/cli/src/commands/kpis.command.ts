import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data } from '../lib/helpers/cli-command.helper';

import {
	KPI_CLI_USAGE,
	KPI_VIEWS,
	parseKpiCliOptions,
	type IKpiCliOptions,
	type IKpiThreshold,
	type TKpiCliView,
} from './kpis-options';
import {
	renderKpiCliReport,
	renderKpiCliReportJsonLine,
	type IKpiCliReport,
	type IKpiRenderedMetric,
	type IKpiRenderedTable,
	type IKpiThresholdBreach,
	type IKpiViewPayload,
} from './kpis-renderer';

type TKpiValueStatus =
	| 'measured'
	| 'estimated'
	| 'unavailable'
	| 'not-configured';

type TKpiHistoryEconomicsStatus =
	| 'provider-reported'
	| 'configured-estimate'
	| 'subscription'
	| 'unavailable';

type TKpiMetricStatus = TKpiValueStatus | TKpiHistoryEconomicsStatus;

interface IKpiMetricLike {
	readonly status: TKpiMetricStatus;
	readonly unit: string;
	readonly source: string;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}

interface IKpiSnapshotLike {
	readonly contract: 'project-kpis.snapshot';
	readonly version: 1;
	readonly generatedAt: string;
	readonly windowDays: number;
	readonly health: {
		readonly status: TKpiValueStatus;
		readonly source: string;
		readonly score: IKpiMetricLike;
		readonly security: IKpiMetricLike;
		readonly deps: IKpiMetricLike;
		readonly quality: IKpiMetricLike;
		readonly debt: IKpiMetricLike;
		readonly next: readonly {
			readonly tool: string;
			readonly reason: string;
		}[];
		readonly note?: string;
	};
	readonly usage: {
		readonly status: TKpiValueStatus;
		readonly source: string;
		readonly calls: IKpiMetricLike;
		readonly errors: IKpiMetricLike;
		readonly toolErrorRate: IKpiMetricLike;
		readonly totalTokens: IKpiMetricLike;
		readonly costUsd: IKpiMetricLike;
		readonly tokensSaved: IKpiMetricLike;
		readonly memoryCompactionSavingsTokens: IKpiMetricLike;
		readonly topPlugins: readonly {
			readonly plugin: string;
			readonly calls: number;
			readonly errors: number;
			readonly totalTokens: number;
			readonly costUsd: number;
		}[];
		readonly note?: string;
	};
	readonly delivery: {
		readonly status: TKpiValueStatus;
		readonly source: string;
		readonly note: string;
	};
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

interface IKpiHistoryEntryLike {
	readonly snapshot: IKpiSnapshotLike;
	readonly persistedAt: string;
	readonly economics: {
		readonly costUsd: IKpiMetricLike;
		readonly tokenSavings: IKpiMetricLike;
		readonly financialSavingsUsd: IKpiMetricLike;
	};
}

interface IKpiHistoryStoreLike {
	readonly contract: 'project-kpis.history';
	readonly version: 1;
	readonly updatedAt: string;
	readonly retentionDays: number;
	readonly entries: readonly IKpiHistoryEntryLike[];
}

interface IUsageSummaryLike {
	readonly updatedAt: string;
	readonly windowDays: number;
	readonly totals: {
		readonly calls: number;
		readonly totalTokens: number;
		readonly costUsd: number;
		readonly tokensSaved: number;
		readonly savingsPercent: number;
		readonly errors: number;
		readonly autoBypassed: number;
	};
	readonly pluginKpis: readonly {
		readonly plugin: string;
		readonly utilityPer1kTokens: number;
		readonly tokenTax: { readonly totalBytes: number };
		readonly kpis: {
			readonly toolErrorRate: number;
			readonly dynamicActivationSavingsBytes: number | null;
			readonly memoryCompactionSavingsTokens: number;
		};
	}[];
	readonly kpis: {
		readonly successfulCallRate: number;
		readonly dynamicActivationSavingsBytes: number | null;
		readonly memoryCompactionSavingsTokens: number;
		readonly memoryCompactionSavingsNote: string;
		readonly toolErrorRate: number;
	};
	readonly limitsStatus: {
		readonly sessionSpendUsd: number;
		readonly sessionLimitUsd: number | null;
		readonly monthlySpendUsd: number;
		readonly monthlyLimitUsd: number | null;
		readonly breached: boolean | null;
	};
	readonly degradations: readonly {
		readonly at: string;
		readonly scope: string;
		readonly fromProvider: string;
		readonly toProvider: string;
		readonly observedUsd: number;
		readonly limitUsd: number;
	}[];
	readonly invocationTelemetry?: {
		readonly totals: {
			readonly calls: number;
			readonly successfulCalls: number;
			readonly failedCalls: number;
			readonly retries: number;
			readonly iterationsObserved: number;
			readonly totalTokens: number;
			readonly costUsd: number;
			readonly withCorrelation: number;
			readonly schemaIncongruences: number;
			readonly averageLatencyMs: number | null;
			readonly p50LatencyMs: number | null;
			readonly p95LatencyMs: number | null;
		};
		readonly byPlugin: readonly ITelemetryBucket[];
		readonly byModel: readonly ITelemetryBucket[];
		readonly byAgent: readonly ITelemetryBucket[];
		readonly byError: readonly ITelemetryBucket[];
		readonly issues: readonly {
			readonly ts: string;
			readonly plugin: string;
			readonly tool: string;
			readonly requestType: string;
			readonly outcome: string;
			readonly correlationId: string | null;
			readonly classification: string;
			readonly code: string;
			readonly message: string;
			readonly incongruence: boolean;
			readonly iteration: number | null;
		}[];
	};
}

interface ITelemetryBucket {
	readonly key: string;
	readonly calls: number;
	readonly successfulCalls: number;
	readonly failedCalls: number;
	readonly retries: number;
	readonly iterationsObserved: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly averageLatencyMs: number | null;
	readonly p50LatencyMs: number | null;
	readonly p95LatencyMs: number | null;
	readonly lastSeenAt: string | null;
	readonly latestError: string | null;
}

interface ICollectedSources {
	readonly snapshot?: IKpiSnapshotLike;
	readonly snapshotError?: string;
	readonly history?: IKpiHistoryStoreLike;
	readonly usageSummary?: IUsageSummaryLike;
	readonly historyPath: string;
	readonly usageSummaryPath: string;
}

interface ISelectedHistory {
	readonly entries: readonly IKpiHistoryEntryLike[];
	readonly totalEntries: number;
	readonly from: string;
	readonly to: string;
	readonly windowDays: number;
}

interface IKpiCommandRuntime {
	readonly pathExists?: (path: string) => boolean;
	readonly readTextFile?: (path: string) => Promise<string>;
	readonly wait?: (ms: number) => Promise<void>;
	readonly write?: (chunk: string) => void;
	readonly isTty?: boolean;
	readonly maxPasses?: number;
	readonly now?: () => Date;
}

const PROJECT_KPIS_TOOL = 'delendai_project_kpis';
const DAY_MS = 86_400_000;

const asIso = (value: Date): string => value.toISOString();

const parseIso = (value: string): number | undefined => {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
};

const readJsonIfPresent = async <T>(
	path: string,
	runtime: IKpiCommandRuntime,
): Promise<T | undefined> => {
	const pathExists = runtime.pathExists ?? existsSync;
	const readTextFile =
		runtime.readTextFile ?? ((target: string) => readFile(target, 'utf8'));
	if (!pathExists(path)) return undefined;
	return JSON.parse(await readTextFile(path)) as T;
};

const toMetric = (
	label: string,
	key: string,
	metric: IKpiMetricLike,
): IKpiRenderedMetric => ({
	key,
	label,
	status: metric.status,
	source: metric.source,
	unit: metric.unit,
	...(metric.value !== undefined ? { value: metric.value } : {}),
	...(metric.observedAt !== undefined
		? { observedAt: metric.observedAt }
		: {}),
	...(metric.note !== undefined ? { note: metric.note } : {}),
});

const localMetric = (
	key: string,
	label: string,
	unit: string,
	value: number | string | undefined,
	status: string,
	source: string,
	note?: string,
): IKpiRenderedMetric => ({
	key,
	label,
	status,
	source,
	unit,
	...(value !== undefined ? { value } : {}),
	...(note !== undefined ? { note } : {}),
});

const compareHistory = (
	left: IKpiHistoryEntryLike,
	right: IKpiHistoryEntryLike,
): number =>
	left.snapshot.generatedAt.localeCompare(right.snapshot.generatedAt);

const trendOf = (
	entries: readonly IKpiHistoryEntryLike[],
	selector: (entry: IKpiHistoryEntryLike) => IKpiMetricLike,
): {
	readonly direction: 'up' | 'down' | 'stable' | 'unknown';
	readonly previous?: number;
	readonly current?: number;
	readonly delta?: number;
	readonly deltaPercent?: number;
	readonly status: string;
	readonly source: string;
	readonly samples: number;
	readonly note?: string;
} => {
	const samples = entries
		.map((entry) => selector(entry))
		.filter((metric) => metric.value !== undefined);
	const latest = samples.at(-1);
	if (samples.length < 2 || latest === undefined) {
		return {
			direction: 'unknown',
			status: latest?.status ?? 'unavailable',
			source: latest?.source ?? 'project-kpis/history',
			samples: samples.length,
			note: 'Need at least two numeric samples in the selected window.',
		};
	}
	const previous = samples[0];
	const current = samples[samples.length - 1];
	if (previous?.value === undefined || current?.value === undefined) {
		return {
			direction: 'unknown',
			status: current?.status ?? 'unavailable',
			source: current?.source ?? 'project-kpis/history',
			samples: samples.length,
			note: 'Need numeric values in the selected window.',
		};
	}
	const delta = Number((current.value - previous.value).toFixed(6));
	const deltaPercent =
		previous.value === 0
			? undefined
			: Number((delta / previous.value).toFixed(6));
	const direction =
		delta === 0 ||
		(deltaPercent !== undefined && Math.abs(deltaPercent) <= 0.01)
			? 'stable'
			: delta > 0
				? 'up'
				: 'down';
	return {
		direction,
		previous: previous.value,
		current: current.value,
		delta,
		...(deltaPercent !== undefined ? { deltaPercent } : {}),
		status: current.status,
		source: current.source,
		samples: samples.length,
	};
};

const sortTelemetry = (
	buckets: readonly ITelemetryBucket[] | undefined,
	limit: number,
): readonly ITelemetryBucket[] =>
	[...(buckets ?? [])]
		.sort((left, right) => {
			const byCalls = right.calls - left.calls;
			if (byCalls !== 0) return byCalls;
			return left.key.localeCompare(right.key);
		})
		.slice(0, limit);

const collectSources = async (
	ctx: ICliCommandContext,
	options: IKpiCliOptions,
	runtime: IKpiCommandRuntime,
): Promise<ICollectedSources> => {
	const historyPath = join(
		ctx.globals.workspace,
		options.cacheDir,
		'results',
		'project-kpis',
		'history.json',
	);
	const usageSummaryPath = join(
		ctx.globals.workspace,
		options.cacheDir,
		'results',
		'usage-tracking',
		'usage-summary.json',
	);
	const snapshotPromise: Promise<{
		readonly snapshot?: IKpiSnapshotLike;
		readonly snapshotError?: string;
	}> = ctx
		.request<IKpiSnapshotLike>(PROJECT_KPIS_TOOL, {
			...(options.maxBytes !== undefined
				? { maxBytes: options.maxBytes }
				: {}),
			...(options.windowDays !== undefined
				? { windowDays: options.windowDays }
				: {}),
		})
		.then((snapshot) => ({ snapshot }))
		.catch((error: unknown) => ({
			snapshotError:
				error instanceof Error ? error.message : String(error),
		}));
	const [snapshotState, history, usageSummary] = await Promise.all([
		snapshotPromise,
		readJsonIfPresent<IKpiHistoryStoreLike>(historyPath, runtime),
		readJsonIfPresent<IUsageSummaryLike>(usageSummaryPath, runtime),
	]);
	return {
		...(snapshotState.snapshot !== undefined
			? { snapshot: snapshotState.snapshot }
			: {}),
		...(snapshotState.snapshotError !== undefined
			? { snapshotError: snapshotState.snapshotError }
			: {}),
		...(history !== undefined ? { history } : {}),
		...(usageSummary !== undefined ? { usageSummary } : {}),
		historyPath,
		usageSummaryPath,
	};
};

const selectHistory = (
	sources: ICollectedSources,
	options: IKpiCliOptions,
	now: Date,
): ISelectedHistory => {
	const snapshotGeneratedAt = sources.snapshot?.generatedAt ?? asIso(now);
	const to = options.to ?? snapshotGeneratedAt;
	const toMs = parseIso(to) ?? now.getTime();
	const windowDays =
		options.windowDays ??
		sources.snapshot?.windowDays ??
		sources.usageSummary?.windowDays ??
		7;
	const from = options.from ?? asIso(new Date(toMs - windowDays * DAY_MS));
	const fromMs = parseIso(from) ?? toMs - windowDays * DAY_MS;
	const allEntries = [...(sources.history?.entries ?? [])].sort(
		compareHistory,
	);
	const filtered = allEntries.filter((entry) => {
		const ts = parseIso(entry.snapshot.generatedAt);
		return ts !== undefined && ts >= fromMs && ts <= toMs;
	});
	return {
		entries: filtered.slice(-options.limit),
		totalEntries: allEntries.length,
		from,
		to,
		windowDays,
	};
};

const buildPluginRows = (
	snapshot: IKpiSnapshotLike | undefined,
	usageSummary: IUsageSummaryLike | undefined,
	limit: number,
): readonly Record<string, string | number | boolean | null>[] => {
	const telemetryRows = usageSummary?.invocationTelemetry?.byPlugin ?? [];
	const utilityRows = usageSummary?.pluginKpis ?? [];
	const merged = new Map<
		string,
		Record<string, string | number | boolean | null>
	>();
	for (const plugin of snapshot?.usage.topPlugins ?? []) {
		merged.set(plugin.plugin, {
			plugin: plugin.plugin,
			calls: plugin.calls,
			errors: plugin.errors,
			tokens: plugin.totalTokens,
			costUsd: plugin.costUsd,
			utilityPer1kTokens: null,
			toolErrorRate: null,
		});
	}
	for (const row of telemetryRows) {
		const current = merged.get(row.key) ?? {
			plugin: row.key,
			calls: 0,
			errors: 0,
			tokens: 0,
			costUsd: 0,
			utilityPer1kTokens: null,
			toolErrorRate: null,
		};
		merged.set(row.key, {
			...current,
			calls: row.calls,
			errors: row.failedCalls,
			tokens: row.totalTokens,
			costUsd: row.costUsd,
		});
	}
	for (const row of utilityRows) {
		const current = merged.get(row.plugin) ?? {
			plugin: row.plugin,
			calls: 0,
			errors: 0,
			tokens: 0,
			costUsd: 0,
			utilityPer1kTokens: null,
			toolErrorRate: null,
		};
		merged.set(row.plugin, {
			...current,
			utilityPer1kTokens: row.utilityPer1kTokens,
			toolErrorRate: row.kpis.toolErrorRate,
		});
	}
	return [...merged.values()]
		.sort(
			(left, right) => Number(right.calls ?? 0) - Number(left.calls ?? 0),
		)
		.slice(0, limit);
};

const buildCommonLimitations = (
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
): string[] => {
	const limitations: string[] = [];
	if (sources.snapshot?.truncated === true) {
		limitations.push(
			`project-kpis snapshot was truncated to ${sources.snapshot.bytes} bytes${sources.snapshot.originalBytes !== undefined ? ` from ${sources.snapshot.originalBytes}` : ''}`,
		);
	}
	if (sources.snapshot?.health.note !== undefined) {
		limitations.push(sources.snapshot.health.note);
	}
	if (sources.snapshot?.usage.note !== undefined) {
		limitations.push(sources.snapshot.usage.note);
	}
	if (sources.snapshotError !== undefined) {
		limitations.push(`snapshot unavailable: ${sources.snapshotError}`);
	}
	if (selectedHistory.totalEntries === 0) {
		limitations.push('no persisted KPI history entries are available yet');
	}
	if (sources.usageSummary === undefined) {
		limitations.push(
			'usage-summary.json is missing, so model/agent/error breakdowns cannot be projected',
		);
	}
	if (sources.usageSummary?.invocationTelemetry === undefined) {
		limitations.push(
			'usage-summary.json has no invocationTelemetry block yet, so telemetry views stay partial',
		);
	}
	return limitations;
};

const buildSummaryView = (
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
	limitations: readonly string[],
): IKpiViewPayload => {
	const snapshot = sources.snapshot;
	const metrics: IKpiRenderedMetric[] = [];
	if (snapshot !== undefined) {
		metrics.push(
			toMetric('Health score', 'health.score', snapshot.health.score),
			toMetric('Calls', 'usage.calls', snapshot.usage.calls),
			toMetric('Errors', 'usage.errors', snapshot.usage.errors),
			toMetric(
				'Tool error rate',
				'usage.toolErrorRate',
				snapshot.usage.toolErrorRate,
			),
			toMetric(
				'Total tokens',
				'usage.totalTokens',
				snapshot.usage.totalTokens,
			),
			toMetric('Cost USD', 'usage.costUsd', snapshot.usage.costUsd),
			toMetric(
				'Token savings',
				'usage.tokensSaved',
				snapshot.usage.tokensSaved,
			),
		);
	}
	const trends = [
		{
			metric: 'health.score',
			label: 'health.score',
			trend: trendOf(
				selectedHistory.entries,
				(entry) => entry.snapshot.health.score,
			),
		},
		{
			metric: 'usage.calls',
			label: 'usage.calls',
			trend: trendOf(
				selectedHistory.entries,
				(entry) => entry.snapshot.usage.calls,
			),
		},
		{
			metric: 'usage.totalTokens',
			label: 'usage.totalTokens',
			trend: trendOf(
				selectedHistory.entries,
				(entry) => entry.snapshot.usage.totalTokens,
			),
		},
		{
			metric: 'economics.costUsd',
			label: 'economics.costUsd',
			trend: trendOf(
				selectedHistory.entries,
				(entry) => entry.economics.costUsd,
			),
		},
		{
			metric: 'economics.tokenSavings',
			label: 'economics.tokenSavings',
			trend: trendOf(
				selectedHistory.entries,
				(entry) => entry.economics.tokenSavings,
			),
		},
	];
	const tables: IKpiRenderedTable[] = [
		{
			title: 'Trends',
			columns: [
				'metric',
				'direction',
				'current',
				'previous',
				'delta',
				'deltaPercent',
				'status',
				'source',
				'samples',
			],
			rows: trends.map(({ label, trend }) => ({
				metric: label,
				direction: trend.direction,
				current: trend.current ?? null,
				previous: trend.previous ?? null,
				delta: trend.delta ?? null,
				deltaPercent: trend.deltaPercent ?? null,
				status: trend.status,
				source: trend.source,
				samples: trend.samples,
			})),
			note: 'Trends are computed from persisted KPI snapshots inside the selected history window.',
		},
	];
	return {
		title: 'Project KPI summary',
		subtitle:
			snapshot !== undefined
				? `Current snapshot generated at ${snapshot.generatedAt}`
				: 'Current snapshot unavailable; rendering from persisted evidence only',
		metrics,
		tables,
		notes: [
			'Summary reuses the bounded project-kpis snapshot plus persisted history and usage-summary evidence.',
		],
		limitations,
	};
};

const buildHistoryView = (
	selectedHistory: ISelectedHistory,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Persisted KPI history',
	subtitle: `${selectedHistory.entries.length} entry or entries inside the selected window`,
	metrics: [
		localMetric(
			'history.entries',
			'History entries in window',
			'count',
			selectedHistory.entries.length,
			'measured',
			'project-kpis/history',
		),
		localMetric(
			'history.totalEntries',
			'Total retained history entries',
			'count',
			selectedHistory.totalEntries,
			'measured',
			'project-kpis/history',
		),
	],
	tables: [
		{
			title: 'History entries',
			columns: [
				'generatedAt',
				'persistedAt',
				'healthScore',
				'calls',
				'tokens',
				'costUsd',
				'tokenSavings',
			],
			rows: [...selectedHistory.entries].reverse().map((entry) => ({
				generatedAt: entry.snapshot.generatedAt,
				persistedAt: entry.persistedAt,
				healthScore: entry.snapshot.health.score.value ?? null,
				calls: entry.snapshot.usage.calls.value ?? null,
				tokens: entry.snapshot.usage.totalTokens.value ?? null,
				costUsd: entry.economics.costUsd.value ?? null,
				tokenSavings: entry.economics.tokenSavings.value ?? null,
			})),
			note: 'Rows are projected directly from history.json; no raw telemetry is re-aggregated here.',
		},
	],
	notes: ['History view helps compare retained KPI snapshots over time.'],
	limitations,
});

const buildUsageView = (
	sources: ICollectedSources,
	limitations: readonly string[],
): IKpiViewPayload => {
	const snapshot = sources.snapshot;
	const summary = sources.usageSummary;
	const metrics: IKpiRenderedMetric[] = [];
	if (snapshot !== undefined) {
		metrics.push(
			toMetric('Calls', 'usage.calls', snapshot.usage.calls),
			toMetric('Errors', 'usage.errors', snapshot.usage.errors),
			toMetric(
				'Tool error rate',
				'usage.toolErrorRate',
				snapshot.usage.toolErrorRate,
			),
			toMetric(
				'Total tokens',
				'usage.totalTokens',
				snapshot.usage.totalTokens,
			),
			toMetric(
				'Token savings',
				'usage.tokensSaved',
				snapshot.usage.tokensSaved,
			),
		);
	}
	if (summary !== undefined) {
		metrics.push(
			localMetric(
				'usage.successfulCallRate',
				'Successful call rate',
				'ratio',
				summary.kpis.successfulCallRate,
				'measured',
				'usage-summary.json',
			),
			localMetric(
				'usage.autoBypassed',
				'Auto-bypassed calls',
				'count',
				summary.totals.autoBypassed,
				'measured',
				'usage-summary.json',
			),
		);
	}
	return {
		title: 'Usage view',
		subtitle: 'Current usage counters and rates',
		metrics,
		tables: [
			{
				title: 'Current top plugins',
				columns: ['plugin', 'calls', 'errors', 'tokens', 'costUsd'],
				rows: (snapshot?.usage.topPlugins ?? []).map((plugin) => ({
					plugin: plugin.plugin,
					calls: plugin.calls,
					errors: plugin.errors,
					tokens: plugin.totalTokens,
					costUsd: plugin.costUsd,
				})),
				note: 'Top plugin counters come from the current project-kpis snapshot.',
			},
		],
		notes: [
			'Usage view surfaces the current bounded snapshot first and augments it with persisted usage-summary rates when available.',
		],
		limitations,
	};
};

const buildCostsView = (
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Cost and savings view',
	subtitle: 'Current cost evidence plus retained economics history',
	metrics: [
		...(sources.snapshot !== undefined
			? [
					toMetric(
						'Cost USD',
						'usage.costUsd',
						sources.snapshot.usage.costUsd,
					),
					toMetric(
						'Token savings',
						'usage.tokensSaved',
						sources.snapshot.usage.tokensSaved,
					),
					toMetric(
						'Memory compaction savings',
						'usage.memoryCompactionSavingsTokens',
						sources.snapshot.usage.memoryCompactionSavingsTokens,
					),
				]
			: []),
	],
	tables: [
		{
			title: 'Economics history',
			columns: [
				'generatedAt',
				'costStatus',
				'costUsd',
				'tokenSavingsStatus',
				'tokenSavings',
				'financialSavingsStatus',
				'financialSavingsUsd',
			],
			rows: [...selectedHistory.entries].reverse().map((entry) => ({
				generatedAt: entry.snapshot.generatedAt,
				costStatus: entry.economics.costUsd.status,
				costUsd: entry.economics.costUsd.value ?? null,
				tokenSavingsStatus: entry.economics.tokenSavings.status,
				tokenSavings: entry.economics.tokenSavings.value ?? null,
				financialSavingsStatus:
					entry.economics.financialSavingsUsd.status,
				financialSavingsUsd:
					entry.economics.financialSavingsUsd.value ?? null,
			})),
			note: 'The history layer persists whether each value was provider-reported, configured-estimate, subscription or unavailable.',
		},
	],
	notes: [
		'Costs are never inferred from thin air; statuses remain visible so CI can distinguish measured from estimated evidence.',
	],
	limitations,
});

const buildTelemetryTable = (
	title: string,
	buckets: readonly ITelemetryBucket[] | undefined,
	limit: number,
	note: string,
): IKpiRenderedTable => ({
	title,
	columns: [
		'key',
		'calls',
		'failedCalls',
		'retries',
		'totalTokens',
		'costUsd',
		'lastSeenAt',
		'latestError',
	],
	rows: sortTelemetry(buckets, limit).map((row) => ({
		key: row.key,
		calls: row.calls,
		failedCalls: row.failedCalls,
		retries: row.retries,
		totalTokens: row.totalTokens,
		costUsd: row.costUsd,
		lastSeenAt: row.lastSeenAt,
		latestError: row.latestError,
	})),
	note,
});

const buildModelsView = (
	sources: ICollectedSources,
	limit: number,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Model usage view',
	subtitle: 'Observed model buckets from invocationTelemetry',
	metrics: [],
	tables: [
		buildTelemetryTable(
			'Models',
			sources.usageSummary?.invocationTelemetry?.byModel,
			limit,
			'Model rows are projected from usage-summary.json#invocationTelemetry.byModel.',
		),
	],
	notes: [
		'Calls with no explicit model stay grouped under unattributed or equivalent telemetry buckets.',
	],
	limitations,
});

const buildAgentsView = (
	sources: ICollectedSources,
	limit: number,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Agent usage view',
	subtitle: 'Observed agent buckets from invocationTelemetry',
	metrics: [],
	tables: [
		buildTelemetryTable(
			'Agents',
			sources.usageSummary?.invocationTelemetry?.byAgent,
			limit,
			'Agent rows are projected from usage-summary.json#invocationTelemetry.byAgent.',
		),
	],
	notes: [
		'This view stays read-only and avoids re-folding invocations when persisted telemetry is already present.',
	],
	limitations,
});

const buildPluginsView = (
	sources: ICollectedSources,
	limit: number,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Plugin usage view',
	subtitle: 'Merged current snapshot leaders plus persisted plugin KPIs',
	metrics: [],
	tables: [
		{
			title: 'Plugins',
			columns: [
				'plugin',
				'calls',
				'errors',
				'tokens',
				'costUsd',
				'utilityPer1kTokens',
				'toolErrorRate',
			],
			rows: buildPluginRows(
				sources.snapshot,
				sources.usageSummary,
				limit,
			),
			note: 'The command merges snapshot topPlugins, invocationTelemetry.byPlugin and usage-summary pluginKpis without recomputing source aggregates.',
		},
	],
	notes: [
		'Plugin rows are intentionally merged so humans and CI can read one surface instead of stitching several outputs.',
	],
	limitations,
});

const buildErrorsView = (
	sources: ICollectedSources,
	limit: number,
	limitations: readonly string[],
): IKpiViewPayload => {
	const telemetry = sources.usageSummary?.invocationTelemetry;
	const metrics: IKpiRenderedMetric[] = [];
	if (telemetry !== undefined) {
		metrics.push(
			localMetric(
				'telemetry.failedCalls',
				'Failed calls',
				'count',
				telemetry.totals.failedCalls,
				'measured',
				'usage-summary.json#invocationTelemetry',
			),
			localMetric(
				'telemetry.retries',
				'Retries',
				'count',
				telemetry.totals.retries,
				'measured',
				'usage-summary.json#invocationTelemetry',
			),
			localMetric(
				'telemetry.schemaIncongruences',
				'Schema incongruences',
				'count',
				telemetry.totals.schemaIncongruences,
				'measured',
				'usage-summary.json#invocationTelemetry',
			),
		);
	}
	return {
		title: 'Error telemetry view',
		subtitle: 'Observed error classes and recent issues',
		metrics,
		tables: [
			buildTelemetryTable(
				'Error classes',
				telemetry?.byError,
				limit,
				'Rows are sorted by calls; the none bucket stays visible but secondary.',
			),
			{
				title: 'Recent issues',
				columns: [
					'ts',
					'classification',
					'code',
					'plugin',
					'tool',
					'outcome',
					'correlationId',
				],
				rows: (telemetry?.issues ?? [])
					.slice(0, limit)
					.map((issue) => ({
						ts: issue.ts,
						classification: issue.classification,
						code: issue.code,
						plugin: issue.plugin,
						tool: issue.tool,
						outcome: issue.outcome,
						correlationId: issue.correlationId,
					})),
				note: 'Recent issues come straight from the persisted invocationTelemetry.issues block.',
			},
		],
		notes: [
			'Error details remain metadata-only; no prompt or response bodies are rendered.',
		],
		limitations,
	};
};

const buildEfficiencyView = (
	sources: ICollectedSources,
	limit: number,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Efficiency view',
	subtitle: 'Token savings, compaction savings and plugin utility',
	metrics: [
		...(sources.snapshot !== undefined
			? [
					toMetric(
						'Token savings',
						'usage.tokensSaved',
						sources.snapshot.usage.tokensSaved,
					),
					toMetric(
						'Memory compaction savings',
						'usage.memoryCompactionSavingsTokens',
						sources.snapshot.usage.memoryCompactionSavingsTokens,
					),
				]
			: []),
		...(sources.usageSummary !== undefined
			? [
					localMetric(
						'usage.dynamicActivationSavingsBytes',
						'Dynamic activation savings bytes',
						'count',
						sources.usageSummary.kpis
							.dynamicActivationSavingsBytes ?? undefined,
						sources.usageSummary.kpis
							.dynamicActivationSavingsBytes === null
							? 'unavailable'
							: 'measured',
						'usage-summary.json',
					),
				]
			: []),
	],
	tables: [
		{
			title: 'Plugin efficiency',
			columns: [
				'plugin',
				'utilityPer1kTokens',
				'tokenTaxBytes',
				'toolErrorRate',
				'memoryCompactionSavingsTokens',
			],
			rows: [...(sources.usageSummary?.pluginKpis ?? [])]
				.sort(
					(left, right) =>
						right.utilityPer1kTokens - left.utilityPer1kTokens,
				)
				.slice(0, limit)
				.map((row) => ({
					plugin: row.plugin,
					utilityPer1kTokens: row.utilityPer1kTokens,
					tokenTaxBytes: row.tokenTax.totalBytes,
					toolErrorRate: row.kpis.toolErrorRate,
					memoryCompactionSavingsTokens:
						row.kpis.memoryCompactionSavingsTokens,
				})),
			note: 'Utility comes from persisted usage-summary plugin KPIs, not an ad-hoc CLI formula.',
		},
	],
	notes: [
		'Efficiency remains evidence-backed: saved bytes and saved tokens are shown only when the persisted summary already computed them.',
	],
	limitations,
});

const buildAuditView = (
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
	limitations: readonly string[],
): IKpiViewPayload => ({
	title: 'Audit and limitations view',
	subtitle: 'Data-quality posture, next actions and delivery note',
	metrics: [
		...(sources.snapshot !== undefined
			? [
					localMetric(
						'delivery.status',
						'Delivery status',
						'text',
						sources.snapshot.delivery.status,
						sources.snapshot.delivery.status,
						sources.snapshot.delivery.source,
						sources.snapshot.delivery.note,
					),
				]
			: []),
		...(sources.usageSummary !== undefined
			? [
					localMetric(
						'limits.breached',
						'Spend limits breached',
						'text',
						String(
							sources.usageSummary.limitsStatus.breached ??
								'unknown',
						),
						'measured',
						'usage-summary.json',
					),
				]
			: []),
	],
	tables: [
		{
			title: 'Next actions',
			columns: ['tool', 'reason'],
			rows: (sources.snapshot?.health.next ?? []).map((entry) => ({
				tool: entry.tool,
				reason: entry.reason,
			})),
			note: 'These actions come from the snapshot health section.',
		},
		{
			title: 'Degradations',
			columns: [
				'at',
				'scope',
				'fromProvider',
				'toProvider',
				'observedUsd',
				'limitUsd',
			],
			rows: (sources.usageSummary?.degradations ?? [])
				.slice(-selectedHistory.windowDays)
				.map((row) => ({
					at: row.at,
					scope: row.scope,
					fromProvider: row.fromProvider,
					toProvider: row.toProvider,
					observedUsd: row.observedUsd,
					limitUsd: row.limitUsd,
				})),
			note: 'Degradations are copied from usage-summary.json when present.',
		},
	],
	notes: [
		'Audit view exists to surface data quality and explicit caveats, not to invent missing evidence.',
	],
	limitations,
});

const buildViewPayload = (
	view: TKpiCliView,
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
	limit: number,
): IKpiViewPayload => {
	const limitations = buildCommonLimitations(sources, selectedHistory);
	if (view === 'summary')
		return buildSummaryView(sources, selectedHistory, limitations);
	if (view === 'history')
		return buildHistoryView(selectedHistory, limitations);
	if (view === 'usage') return buildUsageView(sources, limitations);
	if (view === 'costs')
		return buildCostsView(sources, selectedHistory, limitations);
	if (view === 'models') return buildModelsView(sources, limit, limitations);
	if (view === 'agents') return buildAgentsView(sources, limit, limitations);
	if (view === 'plugins')
		return buildPluginsView(sources, limit, limitations);
	if (view === 'errors') return buildErrorsView(sources, limit, limitations);
	if (view === 'efficiency')
		return buildEfficiencyView(sources, limit, limitations);
	return buildAuditView(sources, selectedHistory, limitations);
};

const buildThresholdValueMap = (
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
): ReadonlyMap<string, number | undefined> => {
	const snapshot = sources.snapshot;
	const telemetry = sources.usageSummary?.invocationTelemetry;
	const metrics = new Map<string, number | undefined>([
		['health.score', snapshot?.health.score.value],
		['health.security', snapshot?.health.security.value],
		['health.deps', snapshot?.health.deps.value],
		['health.quality', snapshot?.health.quality.value],
		['health.debt', snapshot?.health.debt.value],
		['usage.calls', snapshot?.usage.calls.value],
		['usage.errors', snapshot?.usage.errors.value],
		['usage.toolErrorRate', snapshot?.usage.toolErrorRate.value],
		['usage.totalTokens', snapshot?.usage.totalTokens.value],
		['usage.costUsd', snapshot?.usage.costUsd.value],
		['usage.tokensSaved', snapshot?.usage.tokensSaved.value],
		[
			'usage.memoryCompactionSavingsTokens',
			snapshot?.usage.memoryCompactionSavingsTokens.value,
		],
		['history.entries', selectedHistory.entries.length],
		['history.totalEntries', selectedHistory.totalEntries],
		['telemetry.calls', telemetry?.totals.calls],
		['telemetry.failedCalls', telemetry?.totals.failedCalls],
		['telemetry.retries', telemetry?.totals.retries],
		[
			'telemetry.schemaIncongruences',
			telemetry?.totals.schemaIncongruences,
		],
		['telemetry.costUsd', telemetry?.totals.costUsd],
		['telemetry.totalTokens', telemetry?.totals.totalTokens],
	]);
	if (telemetry?.totals.calls !== undefined && telemetry.totals.calls > 0) {
		metrics.set(
			'telemetry.successRate',
			telemetry.totals.successfulCalls / telemetry.totals.calls,
		);
	}
	return metrics;
};

const compareThreshold = (
	actual: number,
	threshold: IKpiThreshold,
): boolean => {
	if (threshold.operator === '<') return actual < threshold.expected;
	if (threshold.operator === '<=') return actual <= threshold.expected;
	if (threshold.operator === '>') return actual > threshold.expected;
	if (threshold.operator === '>=') return actual >= threshold.expected;
	if (threshold.operator === '==') return actual === threshold.expected;
	return actual !== threshold.expected;
};

const evaluateThresholds = (
	thresholds: readonly IKpiThreshold[],
	values: ReadonlyMap<string, number | undefined>,
): readonly IKpiThresholdBreach[] =>
	thresholds.flatMap<IKpiThresholdBreach>((threshold) => {
		const actual = values.get(threshold.metric);
		if (actual === undefined) {
			return [
				{
					metric: threshold.metric,
					operator: threshold.operator,
					expected: threshold.expected,
					raw: threshold.raw,
					reason: 'metric unavailable in current evidence set',
				},
			];
		}
		return compareThreshold(actual, threshold)
			? []
			: [
					{
						metric: threshold.metric,
						operator: threshold.operator,
						expected: threshold.expected,
						actual,
						raw: threshold.raw,
					},
				];
	});

const buildReport = (
	view: TKpiCliView,
	sources: ICollectedSources,
	selectedHistory: ISelectedHistory,
	thresholds: readonly IKpiThreshold[],
	limit: number,
): IKpiCliReport => {
	const payload = buildViewPayload(view, sources, selectedHistory, limit);
	const breaches = evaluateThresholds(
		thresholds,
		buildThresholdValueMap(sources, selectedHistory),
	);
	return {
		contract: 'cli.kpis-report',
		version: 1,
		view,
		availableViews: KPI_VIEWS,
		generatedAt: sources.snapshot?.generatedAt ?? asIso(new Date()),
		period: {
			from: selectedHistory.from,
			to: selectedHistory.to,
			windowDays: selectedHistory.windowDays,
		},
		sources: {
			snapshot: {
				available: sources.snapshot !== undefined,
				source: sources.snapshot?.health.source ?? PROJECT_KPIS_TOOL,
			},
			history: {
				available: sources.history !== undefined,
				source: sources.historyPath,
				entries: selectedHistory.entries.length,
				totalEntries: selectedHistory.totalEntries,
			},
			usageSummary: {
				available: sources.usageSummary !== undefined,
				source: sources.usageSummaryPath,
			},
			telemetry: {
				available:
					sources.usageSummary?.invocationTelemetry !== undefined,
				source: `${sources.usageSummaryPath}#invocationTelemetry`,
			},
		},
		thresholds: {
			configured: thresholds,
			breached: breaches.length > 0,
			breaches,
		},
		payload,
	};
};

const resultCodeFor = (report: IKpiCliReport): ICliCommandResult['code'] =>
	report.thresholds.breached ? EXIT_CODE.VALIDATION : EXIT_CODE.OK;

export const runKpisCommandBody = async (
	args: readonly string[],
	ctx: ICliCommandContext,
	runtime: IKpiCommandRuntime = {},
): Promise<ICliCommandResult> => {
	const parsed = parseKpiCliOptions(args, ctx.globals);
	if (!parsed.ok) {
		return {
			code: EXIT_CODE.USAGE,
			error: parsed.error,
		};
	}
	const options = parsed.value;
	const write =
		runtime.write ?? ((chunk: string) => process.stdout.write(chunk));
	const wait =
		runtime.wait ??
		((ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const now = runtime.now ?? (() => new Date());
	let pass = 0;
	for (;;) {
		const sources = await collectSources(ctx, options, runtime);
		const selectedHistory = selectHistory(sources, options, now());
		const report = buildReport(
			options.view,
			sources,
			selectedHistory,
			options.thresholds,
			options.limit,
		);
		const code = resultCodeFor(report);
		if (!options.watch) {
			if (options.emitJson) return data(report, code);
			return { code, text: renderKpiCliReport(report) };
		}
		if (
			(runtime.isTty ?? process.stdout.isTTY) === true &&
			!options.emitJson &&
			pass > 0
		) {
			write('\u001bc');
		}
		write(
			options.emitJson
				? renderKpiCliReportJsonLine(report)
				: renderKpiCliReport(report),
		);
		pass += 1;
		if (
			code !== EXIT_CODE.OK ||
			(runtime.maxPasses !== undefined && pass >= runtime.maxPasses)
		) {
			return {
				code,
				data: report,
				suppressDefaultPrint: true,
			};
		}
		await wait(options.watchIntervalMs);
	}
};

const kpisCommand: ICliCommand = {
	name: 'kpis',
	summary:
		'Render project KPIs from the bounded project-kpis snapshot plus persisted history and usage-summary evidence.',
	usage: KPI_CLI_USAGE,
	async run(args, ctx) {
		return runKpisCommandBody(args, ctx);
	},
};

export const kpisCommands: readonly ICliCommand[] = [kpisCommand];
