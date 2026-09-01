// effect-boundary-authorized: Probes for persisted KPI source artifacts before delegating parsing to the owning usage and history readers.
import { access } from 'node:fs/promises';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	joinUnderRoot,
	joinRel,
	resolveAgainstRoots,
	toolError,
	toolJson,
	truncateIfTooLarge,
} from '@mcp-vertex/core/public';
import { hydrateKpis, type IAggregateKpis } from '@mcp-vertex/core/public';
import {
	readInvocations,
	readSummary,
	type IInvocationRecord,
	type IUsageSummary,
} from '@mcp-vertex/usage-tracking/public';
import z from 'zod';

import {
	KPI_DETAIL_LEVELS,
	KPI_DIMENSIONS,
	KPI_VIEW_STATUSES,
	PROJECT_KPI_VIEWS,
	type IKpiQuery,
	type IKpiQueryFilter,
	type IProjectKpisToolOptions,
	type TKpiDetailLevel,
	type TKpiDimension,
	type TProjectKpiView,
	type TKpiViewStatus,
} from '../contracts/kpi-query.interface';
import type {
	IKpiHistoryReadResult,
	IKpiTrendReport,
} from '../contracts/kpi-history.interface';
import type {
	IKpiSnapshot,
	IKpiNextAction,
} from '../contracts/kpi-snapshot.interface';
import {
	buildKpiSnapshot,
	DEFAULT_KPI_MAX_BYTES,
	DEFAULT_KPI_WINDOW_DAYS,
} from '../services/kpi-aggregation.service';
import {
	DEFAULT_KPI_HISTORY_WINDOW_DAYS,
	readKpiHistoryWindow,
} from '../services/kpi-history.service';
import { buildKpiTrendReport } from '../services/kpi-trends.service';
import {
	ProjectKpisOutputSchema,
	type IProjectKpisOutput,
} from './project-kpis-output.schema';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;
const FULL_DETAIL_LIMIT = 12;
const EXTENDED_DETAIL_LIMIT = 20;

const InputSchema = z
	.object({
		view: z.enum(PROJECT_KPI_VIEWS).optional(),
		from: z.string().optional(),
		to: z.string().optional(),
		windowDays: z.number().int().positive().optional(),
		limit: z.number().int().positive().optional(),
		detail: z.enum(KPI_DETAIL_LEVELS).optional(),
		dimensions: z.array(z.enum(KPI_DIMENSIONS)).optional(),
		filter: z
			.object({
				provider: z.string().optional(),
				plugin: z.string().optional(),
				tool: z.string().optional(),
				agent: z.string().optional(),
				extension: z.string().optional(),
				model: z.string().optional(),
				requestType: z.string().optional(),
				outcome: z
					.enum(['success', 'error', 'timeout', 'fallback'])
					.optional(),
				error: z.string().optional(),
			})
			.strict()
			.optional(),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

type IProjectKpisToolArgs = z.infer<typeof InputSchema>;
type IProjectKpisSource = IProjectKpisOutput['sources'][number];
type IProjectKpisRecommendation = IProjectKpisOutput['recommendations'][number];
type IProjectKpisDisplayMetric = NonNullable<
	IProjectKpisOutput['snapshot']
>['highlights'][number];
type IProjectKpisBreakdown = NonNullable<
	IProjectKpisOutput['breakdowns']
>[number];
type IProjectKpisBreakdownItem = IProjectKpisBreakdown['items'][number];
type IProjectKpisIssuesSection = NonNullable<IProjectKpisOutput['issues']>;
type IProjectKpisFindingsSection = NonNullable<IProjectKpisOutput['findings']>;

interface IResolvedQuery {
	readonly view: TProjectKpiView;
	readonly detail: TKpiDetailLevel;
	readonly dimensions: readonly TKpiDimension[];
	readonly filter?: IKpiQueryFilter;
	readonly from: string;
	readonly to: string;
	readonly windowDays: number;
	readonly limit: number;
	readonly maxBytes: number;
}

interface IKpiTelemetryRecord extends IInvocationRecord {
	readonly host?: string;
	readonly requestType?: string;
	readonly iteration?: number | null;
	readonly retry?: boolean;
	readonly latencyMs?: number | null;
	readonly tokenCount?: number | null;
	readonly dimensions?: {
		readonly model?: string | null;
		readonly error?: string | null;
	};
	readonly correlation?: {
		readonly id: string;
	};
	readonly errorTelemetry?: {
		readonly classification: string;
		readonly correlationId: string | null;
		readonly incongruence: boolean;
		readonly message: string;
	};
}

interface IToolSourceState {
	readonly summaryPathAbs: string;
	readonly invocationsPathAbs: string;
	readonly historyPathAbs: string;
	readonly activationPathAbs: string;
	readonly summaryExists: boolean;
	readonly invocationsExists: boolean;
	readonly historyExists: boolean;
	readonly activationExists: boolean;
	readonly activation: IAggregateKpis | null;
	readonly summary: IUsageSummary | null;
	readonly records: readonly IKpiTelemetryRecord[];
	readonly history: IKpiHistoryReadResult;
	readonly snapshot: IKpiSnapshot;
	readonly trend: IKpiTrendReport;
	readonly now: Date;
}

const DETAIL_LIMITS: Readonly<
	Record<
		TKpiDetailLevel,
		{
			readonly highlights: number;
			readonly breakdowns: number;
			readonly historyEntries: number;
			readonly issues: number;
			readonly findings: number;
			readonly recommendations: number;
		}
	>
> = {
	compact: {
		highlights: 6,
		breakdowns: 3,
		historyEntries: 3,
		issues: 3,
		findings: 3,
		recommendations: 3,
	},
	standard: {
		highlights: 8,
		breakdowns: 8,
		historyEntries: 7,
		issues: 8,
		findings: 6,
		recommendations: 5,
	},
	full: {
		highlights: FULL_DETAIL_LIMIT,
		breakdowns: EXTENDED_DETAIL_LIMIT,
		historyEntries: EXTENDED_DETAIL_LIMIT,
		issues: EXTENDED_DETAIL_LIMIT,
		findings: FULL_DETAIL_LIMIT,
		recommendations: 8,
	},
};

const VIEW_DEFAULT_DIMENSIONS: Readonly<
	Record<string, readonly TKpiDimension[]>
> = {
	summary: ['plugin'],
	history: ['day'],
	usage: ['plugin', 'agent'],
	economics: ['plugin'],
	models: ['model'],
	agents: ['agent'],
	plugins: ['plugin'],
	errors: ['error', 'outcome'],
	efficiency: ['plugin'],
	audit: ['error'],
};

const parseTime = (value: string): number => {
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid ISO timestamp: ${value}`);
	}
	return parsed;
};

const asIsoString = (value: Date): string => value.toISOString();

const round = (value: number): number => Number(value.toFixed(6));

const effectiveWindowDays = (
	from: string,
	to: string,
	fallback: number,
): number => {
	const delta = Math.max(
		1,
		Math.ceil((parseTime(to) - parseTime(from)) / DAY_MS),
	);
	return Number.isFinite(delta) && delta > 0 ? delta : fallback;
};

const deriveViewStatus = (
	states: readonly TKpiViewStatus[],
): TKpiViewStatus => {
	const filtered = states.filter((state) => state !== undefined);
	if (filtered.length === 0) return 'unavailable';
	if (filtered.every((state) => state === 'not-configured'))
		return 'not-configured';
	if (filtered.every((state) => state === 'unavailable'))
		return 'unavailable';
	if (filtered.some((state) => state === 'partial')) return 'partial';
	if (
		filtered.some(
			(state) => state === 'unavailable' || state === 'not-configured',
		) &&
		filtered.some((state) => state === 'measured' || state === 'estimated')
	) {
		return 'partial';
	}
	if (filtered.some((state) => state === 'estimated')) return 'estimated';
	return 'measured';
};

const statusFromMetric = (status: string): TKpiViewStatus => {
	if ((KPI_VIEW_STATUSES as readonly string[]).includes(status)) {
		return status as TKpiViewStatus;
	}
	return 'unavailable';
};

const buildDisplayMetric = (input: {
	readonly key: string;
	readonly label: string;
	readonly status: TKpiViewStatus;
	readonly unit:
		| 'score'
		| 'count'
		| 'ratio'
		| 'tokens'
		| 'usd'
		| 'bytes'
		| 'ms';
	readonly source: string;
	readonly value?: number;
	readonly observedAt?: string;
	readonly note?: string;
}): IProjectKpisDisplayMetric => ({
	key: input.key,
	label: input.label,
	status: input.status,
	unit: input.unit,
	source: input.source,
	...(input.value !== undefined ? { value: input.value } : {}),
	...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
	...(input.note !== undefined ? { note: input.note } : {}),
});

const highlightFromSnapshot = (
	key: string,
	label: string,
	unit: 'score' | 'count' | 'ratio' | 'tokens' | 'usd',
	metric: IKpiSnapshot['health']['score'] | IKpiSnapshot['usage']['calls'],
) =>
	buildDisplayMetric({
		key,
		label,
		status: statusFromMetric(metric.status),
		unit,
		source: metric.source,
		...(metric.value !== undefined ? { value: metric.value } : {}),
		...(metric.observedAt !== undefined
			? { observedAt: metric.observedAt }
			: {}),
		...(metric.note !== undefined ? { note: metric.note } : {}),
	});

const cacheDirAbsOf = (options: IProjectKpisToolOptions): string => {
	const contained = resolveAgainstRoots(
		options.workspaceRootAbs,
		[options.workspaceRootAbs],
		options.cacheDir,
	);
	if (!contained.ok) {
		throw new Error(
			`Configured project KPI cache directory is outside the workspace: ${contained.reason ?? options.cacheDir}`,
		);
	}
	return contained.abs;
};

const usageSummaryPathOf = (options: IProjectKpisToolOptions): string =>
	joinUnderRoot(
		cacheDirAbsOf(options),
		'results/usage-tracking/usage-summary.json',
	);

const usageInvocationsPathOf = (options: IProjectKpisToolOptions): string =>
	joinUnderRoot(
		cacheDirAbsOf(options),
		'results/usage-tracking/invocations.jsonl',
	);

const historyPathOf = (options: IProjectKpisToolOptions): string =>
	joinUnderRoot(cacheDirAbsOf(options), 'results/project-kpis/history.json');

const activationPathOf = (options: IProjectKpisToolOptions): string =>
	joinRel(options.workspaceRootAbs, '.vscode/mcp-vertex/kpis.json');

const buildSource = (input: {
	readonly id: IProjectKpisSource['id'];
	readonly kind: IProjectKpisSource['kind'];
	readonly status: IProjectKpisSource['status'];
	readonly observedAt?: string;
	readonly note?: string;
}): IProjectKpisSource => ({
	id: input.id,
	kind: input.kind,
	status: input.status,
	...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
	...(input.note !== undefined ? { note: input.note } : {}),
});

const normalizeFilter = (
	filter: IProjectKpisToolArgs['filter'],
): IKpiQueryFilter | undefined => {
	if (filter === undefined) return undefined;
	return {
		...(filter.provider !== undefined ? { provider: filter.provider } : {}),
		...(filter.plugin !== undefined ? { plugin: filter.plugin } : {}),
		...(filter.tool !== undefined ? { tool: filter.tool } : {}),
		...(filter.agent !== undefined ? { agent: filter.agent } : {}),
		...(filter.extension !== undefined
			? { extension: filter.extension }
			: {}),
		...(filter.model !== undefined ? { model: filter.model } : {}),
		...(filter.requestType !== undefined
			? { requestType: filter.requestType }
			: {}),
		...(filter.outcome !== undefined ? { outcome: filter.outcome } : {}),
		...(filter.error !== undefined ? { error: filter.error } : {}),
	};
};

const toKpiQuery = (query: IResolvedQuery): IKpiQuery => ({
	view: query.view,
	from: query.from,
	to: query.to,
	windowDays: query.windowDays,
	limit: query.limit,
	detail: query.detail,
	dimensions: [...query.dimensions],
	...(query.filter !== undefined ? { filter: query.filter } : {}),
	maxBytes: query.maxBytes,
});

const normalizeQuery = (
	args: IProjectKpisToolArgs,
	options: IProjectKpisToolOptions,
): IResolvedQuery => {
	const now = options.now ?? new Date();
	const to = args.to ?? asIsoString(now);
	const windowDays =
		args.windowDays ??
		options.windowDays ??
		DEFAULT_KPI_HISTORY_WINDOW_DAYS;
	const from =
		args.from ?? asIsoString(new Date(parseTime(to) - windowDays * DAY_MS));
	const view = args.view ?? 'summary';
	const filter = normalizeFilter(args.filter);
	return {
		view,
		detail: args.detail ?? 'standard',
		dimensions: args.dimensions ??
			VIEW_DEFAULT_DIMENSIONS[view ?? 'summary'] ?? ['plugin'],
		...(filter !== undefined ? { filter } : {}),
		from,
		to,
		windowDays: effectiveWindowDays(from, to, windowDays),
		limit: Math.max(1, Math.min(MAX_LIMIT, args.limit ?? DEFAULT_LIMIT)),
		maxBytes: args.maxBytes ?? options.maxBytes ?? DEFAULT_KPI_MAX_BYTES,
	};
};

const matchesFilter = (
	record: IKpiTelemetryRecord,
	filter: IKpiQueryFilter | undefined,
): boolean => {
	if (filter === undefined) return true;
	if (
		filter.provider !== undefined &&
		record.model?.provider !== filter.provider
	)
		return false;
	if (filter.plugin !== undefined && record.plugin !== filter.plugin)
		return false;
	if (filter.tool !== undefined && record.tool !== filter.tool) return false;
	if (filter.agent !== undefined && record.agent.id !== filter.agent)
		return false;
	if (
		filter.extension !== undefined &&
		record.agent.extension !== filter.extension
	)
		return false;
	if (
		filter.model !== undefined &&
		`${record.model?.provider ?? 'unknown'}/${record.model?.modelId ?? 'unattributed'}` !==
			filter.model &&
		record.model?.modelId !== filter.model
	) {
		return false;
	}
	if (
		(record.requestType ?? 'unknown') !==
		(filter.requestType ?? record.requestType ?? 'unknown')
	) {
		if (filter.requestType !== undefined) return false;
	}
	if (filter.outcome !== undefined && record.outcome !== filter.outcome)
		return false;
	const classification =
		record.errorTelemetry?.classification ??
		(record.error ? 'tool-error' : 'none');
	if (filter.error !== undefined && classification !== filter.error)
		return false;
	return true;
};

const filterRecords = (
	records: readonly IKpiTelemetryRecord[],
	query: IResolvedQuery,
): IKpiTelemetryRecord[] => {
	const fromMs = parseTime(query.from);
	const toMs = parseTime(query.to);
	return records.filter((record) => {
		const ts = Date.parse(record.ts);
		return (
			ts >= fromMs && ts <= toMs && matchesFilter(record, query.filter)
		);
	});
};

const aggregateRecords = (
	records: readonly IKpiTelemetryRecord[],
	dimension: TKpiDimension,
) => {
	const groups = new Map<string, IKpiTelemetryRecord[]>();
	const keyResolvers: Record<
		TKpiDimension,
		(record: IKpiTelemetryRecord) => string
	> = {
		provider: (record) => record.model?.provider ?? 'unattributed',
		plugin: (record) => record.plugin,
		tool: (record) => `${record.plugin}/${record.tool}`,
		agent: (record) => record.agent.id,
		extension: (record) => record.agent.extension,
		model: (record) =>
			record.model === null
				? 'unattributed'
				: `${record.model.provider}/${record.model.modelId}`,
		requestType: (record) => record.requestType ?? 'unknown',
		outcome: (record) => record.outcome,
		error: (record) =>
			record.errorTelemetry?.classification ??
			(record.error ? 'tool-error' : 'none'),
		day: (record) => record.ts.slice(0, ISO_DATE_LENGTH),
	};
	const keyOf = keyResolvers[dimension];
	for (const record of records) {
		const key = keyOf(record);
		const existing = groups.get(key);
		if (existing !== undefined) {
			existing.push(record);
			continue;
		}
		groups.set(key, [record]);
	}
	return [...groups.entries()]
		.map(([key, bucket]) => {
			const calls = bucket.length;
			const successfulCalls = bucket.reduce(
				(acc, record) => acc + (record.outcome === 'success' ? 1 : 0),
				0,
			);
			const failedCalls = calls - successfulCalls;
			const errors = bucket.reduce(
				(acc, record) => acc + (record.outcome === 'error' ? 1 : 0),
				0,
			);
			const totalTokens = bucket.reduce(
				(acc, record) =>
					acc +
					(record.tokenCount ??
						record.usage?.totalTokens ??
						record.usage?.inputTokens ??
						0) +
					(record.usage?.outputTokens ?? 0),
				0,
			);
			const costUsd = round(
				bucket.reduce((acc, record) => acc + (record.costUsd ?? 0), 0),
			);
			const tokensSaved = bucket.reduce(
				(acc, record) => acc + (record.tokensSaved ?? 0),
				0,
			);
			const latencies = bucket
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
			return {
				key,
				status: 'measured' as const,
				calls,
				successfulCalls,
				failedCalls,
				errors,
				totalTokens,
				costUsd,
				tokensSaved,
				averageLatencyMs,
				lastSeenAt: bucket.at(-1)?.ts ?? null,
			};
		})
		.sort((left, right) => {
			const byCalls = right.calls - left.calls;
			if (byCalls !== 0) return byCalls;
			return left.key.localeCompare(right.key);
		});
};

const buildSummaryBreakdown = (
	summary: IUsageSummary,
	dimension: TKpiDimension,
):
	| {
			readonly status: TKpiViewStatus;
			readonly source: string;
			readonly totalItems: number;
			readonly items: IProjectKpisBreakdownItem[];
			readonly note?: string;
	  }
	| undefined => {
	const source = '@mcp-vertex/usage-tracking/public#readSummary';
	const mapBucket = (
		bucket: IUsageSummary['byPlugin'][number],
		utilityPer1kTokens?: number,
	): IProjectKpisBreakdownItem => ({
		key: bucket.key,
		status: 'measured' as const,
		calls: bucket.calls,
		errors: bucket.errors,
		totalTokens: bucket.totalTokens,
		costUsd: round(bucket.costUsd),
		tokensSaved: bucket.tokensSaved,
		...(utilityPer1kTokens !== undefined
			? { utilityPer1kTokens: round(utilityPer1kTokens) }
			: {}),
	});
	if (dimension === 'plugin') {
		const utilityByPlugin = new Map(
			summary.pluginKpis.map((plugin) => [
				plugin.plugin,
				plugin.utilityPer1kTokens,
			]),
		);
		return {
			status: 'measured',
			source,
			totalItems: summary.byPlugin.length,
			items: summary.byPlugin.map((bucket) =>
				mapBucket(bucket, utilityByPlugin.get(bucket.key)),
			),
		};
	}
	if (dimension === 'agent') {
		return {
			status: 'measured',
			source,
			totalItems: summary.byAgent.length,
			items: summary.byAgent.map((bucket) => mapBucket(bucket)),
		};
	}
	if (dimension === 'provider') {
		return {
			status: 'measured',
			source,
			totalItems: summary.byProvider.length,
			items: summary.byProvider.map((bucket) => mapBucket(bucket)),
		};
	}
	if (dimension === 'extension') {
		return {
			status: 'measured',
			source,
			totalItems: summary.byExtension.length,
			items: summary.byExtension.map((bucket) => mapBucket(bucket)),
		};
	}
	return undefined;
};

const trendEntriesOf = (trend: IKpiTrendReport) => [
	{ label: 'Health score', ...trend.metrics.healthScore },
	{ label: 'Calls', ...trend.metrics.calls },
	{ label: 'Total tokens', ...trend.metrics.totalTokens },
	{ label: 'Cost USD', ...trend.metrics.costUsd },
	{ label: 'Token savings', ...trend.metrics.tokenSavings },
	{ label: 'Financial savings USD', ...trend.metrics.financialSavingsUsd },
];

const historyEntriesOf = (history: IKpiHistoryReadResult) =>
	history.entries.map((entry) => ({
		generatedAt: entry.snapshot.generatedAt,
		persistedAt: entry.persistedAt,
		healthScore: entry.snapshot.health.score.value,
		calls: entry.snapshot.usage.calls.value,
		totalTokens: entry.snapshot.usage.totalTokens.value,
		costUsdStatus: entry.economics.costUsd.status,
		...(entry.economics.costUsd.value !== undefined
			? { costUsd: round(entry.economics.costUsd.value) }
			: {}),
		tokenSavingsStatus: entry.economics.tokenSavings.status,
		...(entry.economics.tokenSavings.value !== undefined
			? { tokenSavings: entry.economics.tokenSavings.value }
			: {}),
		financialSavingsUsdStatus: entry.economics.financialSavingsUsd.status,
		...(entry.economics.financialSavingsUsd.value !== undefined
			? {
					financialSavingsUsd: round(
						entry.economics.financialSavingsUsd.value,
					),
				}
			: {}),
		...(entry.economics.financialSavingsUsd.note !== undefined
			? { note: entry.economics.financialSavingsUsd.note }
			: {}),
	}));

const issueItemsOf = (records: readonly IKpiTelemetryRecord[]) =>
	records
		.filter(
			(record) =>
				record.outcome === 'error' ||
				record.errorTelemetry !== undefined,
		)
		.map((record) => ({
			ts: record.ts,
			plugin: record.plugin,
			tool: record.tool,
			requestType: record.requestType ?? 'unknown',
			outcome: record.outcome,
			classification:
				record.errorTelemetry?.classification ??
				(record.error ? 'tool-error' : 'unknown'),
			correlationId:
				record.errorTelemetry?.correlationId ??
				record.correlation?.id ??
				null,
			message:
				record.errorTelemetry?.message ??
				record.error?.message ??
				'Unknown tool error',
			incongruence: record.errorTelemetry?.incongruence ?? false,
			iteration: record.iteration ?? null,
		}));

const sourcesOf = (state: IToolSourceState): IProjectKpisOutput['sources'] => {
	const latestHistory = state.history.entries.at(-1);
	const latestInvocationTs = state.records.at(-1)?.ts;
	return [
		buildSource({
			id: 'snapshot',
			kind: 'snapshot',
			status: deriveViewStatus([
				statusFromMetric(state.snapshot.health.status),
				statusFromMetric(state.snapshot.usage.status),
			]),
			observedAt: state.snapshot.generatedAt,
			...(state.snapshot.truncated
				? {
						note: 'Snapshot was bounded before being embedded in the KPI view.',
					}
				: {}),
		}),
		buildSource({
			id: 'usage-summary',
			kind: 'usage-summary',
			status: state.summaryExists
				? state.summary === null
					? 'unavailable'
					: 'measured'
				: 'not-configured',
			...(state.summary?.updatedAt !== undefined
				? { observedAt: state.summary.updatedAt }
				: {}),
			...(state.summaryExists
				? {}
				: {
						note: 'No persisted usage summary was found in the configured cache.',
					}),
		}),
		buildSource({
			id: 'invocations',
			kind: 'invocations',
			status: state.invocationsExists
				? state.records.length > 0
					? 'measured'
					: 'partial'
				: 'not-configured',
			...(latestInvocationTs !== undefined
				? { observedAt: latestInvocationTs }
				: {}),
			...(state.invocationsExists
				? {}
				: {
						note: 'No invocation log was found for dimension-level telemetry.',
					}),
		}),
		buildSource({
			id: 'history',
			kind: 'history',
			status: state.historyExists
				? state.history.entries.length > 0
					? 'measured'
					: 'partial'
				: 'not-configured',
			...(latestHistory?.snapshot.generatedAt !== undefined
				? { observedAt: latestHistory.snapshot.generatedAt }
				: {}),
			...(state.historyExists
				? {}
				: {
						note: 'No persisted KPI history was found for trend views.',
					}),
		}),
		buildSource({
			id: 'trend',
			kind: 'trend',
			status:
				state.history.entries.length >= 2
					? 'measured'
					: state.history.entries.length === 1
						? 'partial'
						: 'not-configured',
			...(latestHistory?.snapshot.generatedAt !== undefined
				? { observedAt: latestHistory.snapshot.generatedAt }
				: {}),
			...(state.history.entries.length >= 2
				? {}
				: {
						note: 'At least two persisted history entries are required to compute trends.',
					}),
		}),
		buildSource({
			id: 'activation-kpis',
			kind: 'activation-kpis',
			status: stateActivationStatus(state),
			...(state.activationExists
				? {}
				: { note: 'No persisted activation KPI file was found.' }),
		}),
	];
};

const recommendationsOf = (
	namespacePrefix: string,
	next: readonly IKpiNextAction[],
	state: IToolSourceState,
): IProjectKpisOutput['recommendations'] => {
	const recommendations: IProjectKpisRecommendation[] = next.map((item) => ({
		tool: item.tool,
		priority: 'now' as const,
		reason: item.reason,
	}));
	if (state.records.length > 0) {
		recommendations.push({
			tool: `${namespacePrefix}_usage_report`,
			priority: 'next',
			reason: 'Use usage_report when you need the raw, single-axis usage breakdown behind this bounded KPI view.',
		});
	}
	if (state.history.entries.length < 2) {
		recommendations.push({
			tool: `${namespacePrefix}_project_kpis`,
			priority: 'later',
			reason: 'Persist more KPI snapshots to unlock evidence-backed history and trend analysis.',
		});
	}
	return recommendations;
};

const limitationsOf = (state: IToolSourceState): string[] => {
	const limitations = [
		'Metadata only: prompts, response bodies, source content, credentials and secrets are never recorded or returned.',
		'Host-level subscription limits outside observed MCP usage may be unavailable in local telemetry.',
	];
	if (!state.invocationsExists) {
		limitations.push(
			'Dimension filters and model/error drill-down require the raw invocation log and degrade when only the persisted summary exists.',
		);
	}
	if (!state.historyExists) {
		limitations.push(
			'Trend views stay explicit about missing evidence when persisted history has not been configured yet.',
		);
	}
	return limitations;
};

const findingsOf = (
	state: IToolSourceState,
	query: IResolvedQuery,
): IProjectKpisFindingsSection => {
	const findings: IProjectKpisFindingsSection = {
		status: 'measured',
		source: 'project-kpis/S5',
		items: [],
	};
	if (!state.historyExists || state.history.entries.length === 0) {
		findings.items.push({
			id: 'history-missing',
			severity: 'warning',
			status: state.historyExists ? 'partial' : 'not-configured',
			summary:
				'Persisted KPI history is not available for this workspace.',
			evidence: `Queried window ${query.from}..${query.to} returned ${state.history.entries.length} history entries from ${state.historyPathAbs}.`,
			recommendation:
				'Persist snapshots before relying on trend-based KPI decisions.',
		});
	}
	if (state.snapshot.truncated) {
		findings.items.push({
			id: 'snapshot-bounded',
			severity: 'info',
			status: 'measured',
			summary:
				'The embedded snapshot was truncated to stay within the configured payload budget.',
			evidence: `Snapshot bytes=${state.snapshot.bytes} originalBytes=${state.snapshot.originalBytes ?? state.snapshot.bytes}.`,
		});
	}
	const incongruences = issueItemsOf(state.records).filter(
		(item) => item.incongruence,
	);
	if (incongruences.length > 0) {
		findings.items.push({
			id: 'schema-incongruence',
			severity: 'error',
			status: 'measured',
			summary:
				'Schema/result incongruences were observed in the invocation telemetry window.',
			evidence: `${incongruences.length} incongruence issue(s) were observed between ${query.from} and ${query.to}.`,
			recommendation:
				'Inspect the errors view and the underlying tool contracts before trusting the affected KPI slices.',
		});
	}
	if (
		state.records.length > 0 &&
		state.records.every((record) => record.model === null)
	) {
		findings.items.push({
			id: 'model-attribution-missing',
			severity: 'warning',
			status: 'partial',
			summary:
				'Invocation telemetry exists but model attribution is missing for the selected window.',
			evidence: `${state.records.length} invocation(s) were observed and none carried a model descriptor.`,
			recommendation:
				'Enable model attribution in the host or orchestrator path before using model-level KPI views.',
		});
	}
	if (
		state.snapshot.usage.calls.value !== undefined &&
		state.snapshot.usage.calls.value > 0 &&
		state.snapshot.usage.costUsd.status === 'unavailable'
	) {
		findings.items.push({
			id: 'cost-unavailable',
			severity: 'info',
			status: 'partial',
			summary:
				'Usage exists but cost evidence is unavailable for the selected window.',
			evidence: `${state.snapshot.usage.calls.value} call(s) were observed while usage.costUsd stayed unavailable.`,
			recommendation:
				'Treat economics as a limitation until providers report cost or safe attribution is configured.',
		});
	}
	findings.status = deriveViewStatus(
		findings.items.length === 0
			? ['measured']
			: findings.items.map((item) => item.status),
	);
	return findings;
};

const fitToBudget = (
	raw: Omit<IProjectKpisOutput, 'bytes' | 'truncated' | 'originalBytes'>,
	maxBytes: number,
): IProjectKpisOutput => {
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return { ...raw, bytes: direct.finalBytes, truncated: false };
	}
	const candidates: Array<
		Omit<IProjectKpisOutput, 'bytes' | 'truncated' | 'originalBytes'>
	> = [
		{
			...raw,
			recommendations: raw.recommendations.slice(0, 3),
			breakdowns: raw.breakdowns?.map((breakdown) => ({
				...breakdown,
				items: breakdown.items.slice(0, 3),
			})),
			history:
				raw.history === undefined
					? undefined
					: {
							...raw.history,
							entries: raw.history.entries.slice(0, 3),
							trends: raw.history.trends.slice(0, 4),
						},
			issues:
				raw.issues === undefined
					? undefined
					: { ...raw.issues, items: raw.issues.items.slice(0, 3) },
			findings:
				raw.findings === undefined
					? undefined
					: {
							...raw.findings,
							items: raw.findings.items.slice(0, 3),
						},
		},
		{
			...raw,
			breakdowns: undefined,
			issues: undefined,
			findings:
				raw.findings === undefined
					? undefined
					: {
							...raw.findings,
							items: raw.findings.items.slice(0, 2),
						},
			history:
				raw.history === undefined
					? undefined
					: {
							...raw.history,
							entries: [],
							trends: raw.history.trends.slice(0, 3),
						},
		},
		{
			...raw,
			history: undefined,
			breakdowns: undefined,
			issues: undefined,
			findings: undefined,
			recommendations: raw.recommendations.slice(0, 2),
		},
	];
	for (const candidate of candidates) {
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return {
				...candidate,
				bytes: bounded.finalBytes,
				truncated: true,
				originalBytes: direct.originalBytes,
			};
		}
	}
	return {
		...raw,
		bytes: direct.finalBytes,
		truncated: true,
		originalBytes: direct.originalBytes,
	};
};

const loadState = async (
	query: IResolvedQuery,
	options: IProjectKpisToolOptions,
): Promise<IToolSourceState> => {
	const pathExists =
		options.pathExists ??
		(async (path: string): Promise<boolean> => {
			try {
				await access(path);
				return true;
			} catch {
				return false;
			}
		});
	const summaryPathAbs = usageSummaryPathOf(options);
	const invocationsPathAbs = usageInvocationsPathOf(options);
	const historyPathAbs = historyPathOf(options);
	const activationPathAbs = activationPathOf(options);
	const [summaryExists, invocationsExists, historyExists, activationExists] =
		await Promise.all([
			pathExists(summaryPathAbs),
			pathExists(invocationsPathAbs),
			pathExists(historyPathAbs),
			pathExists(activationPathAbs),
		]);
	const now = options.now ?? new Date();
	const readUsageSummaryFn = options.readUsageSummary ?? readSummary;
	const readUsageInvocationsFn =
		options.readUsageInvocations ?? readInvocations;
	const summary = summaryExists
		? await readUsageSummaryFn(summaryPathAbs)
		: null;
	const records = invocationsExists
		? ((await readUsageInvocationsFn(
				invocationsPathAbs,
			)) as readonly IKpiTelemetryRecord[])
		: [];
	const snapshotReader =
		options.readSnapshot ??
		(async (currentQuery, currentOptions) =>
			(options.buildKpiSnapshot ?? buildKpiSnapshot)({
				namespacePrefix: currentOptions.namespacePrefix,
				workspaceRootAbs: currentOptions.workspaceRootAbs,
				usageSummaryPathAbs: summaryPathAbs,
				usageInvocationsPathAbs: invocationsPathAbs,
				...(currentOptions.now !== undefined ? { now } : {}),
				...(currentQuery.windowDays !== undefined
					? { windowDays: currentQuery.windowDays }
					: {}),
				...(currentQuery.maxBytes !== undefined
					? { maxBytes: currentQuery.maxBytes }
					: {}),
				...(currentOptions.pathExists !== undefined
					? { pathExists }
					: {}),
				...(currentOptions.readUsageSummary !== undefined
					? { readUsageSummary: currentOptions.readUsageSummary }
					: {}),
				...(currentOptions.readUsageInvocations !== undefined
					? {
							readUsageInvocations:
								currentOptions.readUsageInvocations,
						}
					: {}),
				...(currentOptions.buildUsageSummary !== undefined
					? { buildUsageSummary: currentOptions.buildUsageSummary }
					: {}),
			}));
	const historyReader = options.readKpiHistoryWindow ?? readKpiHistoryWindow;
	const history = await historyReader({
		workspaceRootAbs: options.workspaceRootAbs,
		cacheDir: options.cacheDir,
		now,
		from: query.from,
		to: query.to,
		windowDays: query.windowDays,
		limit: query.limit,
		pathExists,
	});
	let activation: IAggregateKpis | null = null;
	if (activationExists) {
		try {
			const raw = await Bun.file(activationPathAbs).json();
			activation = hydrateKpis(raw).aggregate();
		} catch {
			activation = null;
		}
	}
	const snapshot = await snapshotReader(toKpiQuery(query), options);
	const trend = buildKpiTrendReport(history, {
		windowDays: query.windowDays,
	});
	return {
		summaryPathAbs,
		invocationsPathAbs,
		historyPathAbs,
		activationPathAbs,
		summaryExists,
		invocationsExists,
		historyExists,
		activationExists,
		activation,
		summary,
		records,
		history,
		snapshot,
		trend,
		now,
	};
};

const buildBreakdowns = (
	state: IToolSourceState,
	query: IResolvedQuery,
): IProjectKpisBreakdown[] => {
	const limits = DETAIL_LIMITS[query.detail];
	const filteredRecords = filterRecords(state.records, query);
	return query.dimensions.map((dimension) => {
		const rawBuckets =
			filteredRecords.length > 0
				? aggregateRecords(filteredRecords, dimension)
				: [];
		if (rawBuckets.length > 0) {
			return {
				dimension,
				status: 'measured' as const,
				source: '@mcp-vertex/usage-tracking/public#readInvocations',
				totalItems: rawBuckets.length,
				items: rawBuckets.slice(0, limits.breakdowns),
			};
		}
		const summaryBreakdown =
			state.summary === null
				? undefined
				: buildSummaryBreakdown(state.summary, dimension);
		if (summaryBreakdown !== undefined) {
			return {
				dimension,
				status:
					query.filter === undefined
						? summaryBreakdown.status
						: 'partial',
				source: summaryBreakdown.source,
				totalItems: summaryBreakdown.totalItems,
				items: summaryBreakdown.items.slice(0, limits.breakdowns),
				...(query.filter === undefined
					? {}
					: {
							note: 'Applied filter exactness requires raw invocation records; this breakdown falls back to the unfiltered persisted summary.',
						}),
			};
		}
		return {
			dimension,
			status:
				state.summaryExists || state.invocationsExists
					? 'unavailable'
					: 'not-configured',
			source: 'project-kpis/S5',
			totalItems: 0,
			items: [],
			note:
				dimension === 'model' ||
				dimension === 'requestType' ||
				dimension === 'tool' ||
				dimension === 'error' ||
				dimension === 'day'
					? 'This dimension requires raw invocation telemetry in the selected window.'
					: 'No evidence was available for this dimension in the selected window.',
		};
	});
};

const buildHistorySection = (
	state: IToolSourceState,
	query: IResolvedQuery,
): NonNullable<IProjectKpisOutput['history']> => {
	const limits = DETAIL_LIMITS[query.detail];
	const entries = historyEntriesOf(state.history).slice(
		-limits.historyEntries,
	);
	const trends = trendEntriesOf(state.trend).slice(0, limits.highlights);
	return {
		status:
			state.history.entries.length === 0
				? state.historyExists
					? 'partial'
					: 'not-configured'
				: state.history.entries.length === 1
					? 'partial'
					: 'measured',
		source: state.historyPathAbs,
		entries,
		trends,
		note:
			state.history.entries.length >= 2
				? undefined
				: 'Two or more persisted snapshots are required for stable trend interpretation.',
	};
};

const buildSnapshotSection = (
	state: IToolSourceState,
	query: IResolvedQuery,
): NonNullable<IProjectKpisOutput['snapshot']> => {
	const limits = DETAIL_LIMITS[query.detail];
	const highlights = [
		highlightFromSnapshot(
			'health.score',
			'Health score',
			'score',
			state.snapshot.health.score,
		),
		highlightFromSnapshot(
			'usage.calls',
			'Calls',
			'count',
			state.snapshot.usage.calls,
		),
		highlightFromSnapshot(
			'usage.errors',
			'Errors',
			'count',
			state.snapshot.usage.errors,
		),
		highlightFromSnapshot(
			'usage.toolErrorRate',
			'Tool error rate',
			'ratio',
			state.snapshot.usage.toolErrorRate,
		),
		highlightFromSnapshot(
			'usage.totalTokens',
			'Total tokens',
			'tokens',
			state.snapshot.usage.totalTokens,
		),
		highlightFromSnapshot(
			'usage.costUsd',
			'Cost USD',
			'usd',
			state.snapshot.usage.costUsd,
		),
		highlightFromSnapshot(
			'usage.tokensSaved',
			'Token savings',
			'tokens',
			state.snapshot.usage.tokensSaved,
		),
	].slice(0, limits.highlights);
	if (query.view === 'efficiency' && state.summary !== null) {
		highlights.push(
			buildDisplayMetric({
				key: 'efficiency.successfulCallRate',
				label: 'Successful call rate',
				status: 'measured',
				unit: 'ratio',
				source: '@mcp-vertex/usage-tracking/public#readSummary',
				value: round(state.summary.kpis.successfulCallRate),
				observedAt: state.summary.updatedAt,
			}),
			buildDisplayMetric({
				key: 'efficiency.memoryCompactionSavingsTokens',
				label: 'Memory compaction savings',
				status: 'measured',
				unit: 'tokens',
				source: '@mcp-vertex/usage-tracking/public#readSummary',
				value: state.summary.kpis.memoryCompactionSavingsTokens,
				observedAt: state.summary.updatedAt,
				note: state.summary.kpis.memoryCompactionSavingsNote,
			}),
		);
	}
	return {
		status: deriveViewStatus([
			statusFromMetric(state.snapshot.health.status),
			statusFromMetric(state.snapshot.usage.status),
		]),
		source: 'project-kpis.snapshot',
		generatedAt: state.snapshot.generatedAt,
		windowDays: state.snapshot.windowDays,
		highlights,
		...(state.snapshot.delivery.note !== undefined
			? { note: state.snapshot.delivery.note }
			: {}),
	};
};

const buildIssuesSection = (
	state: IToolSourceState,
	query: IResolvedQuery,
): IProjectKpisIssuesSection => {
	const items = issueItemsOf(filterRecords(state.records, query)).slice(
		0,
		DETAIL_LIMITS[query.detail].issues,
	);
	return {
		status:
			items.length > 0
				? 'measured'
				: state.invocationsExists
					? 'partial'
					: 'not-configured',
		source: '@mcp-vertex/usage-tracking/public#readInvocations',
		items,
		note:
			items.length > 0
				? undefined
				: 'No structured error issues were observed in the selected window.',
	};
};

const viewSummaryOf = (
	view: NonNullable<IResolvedQuery['view']>,
	state: IToolSourceState,
	status: TKpiViewStatus,
): string => {
	const calls = state.snapshot.usage.calls.value;
	const cost = state.snapshot.usage.costUsd.value;
	const health = state.snapshot.health.score.value;
	const historyCount = state.history.entries.length;
	const entryCount = historyCount === 1 ? 'y' : 'ies';
	const summaries: Record<TProjectKpiView, string> = {
		summary: `Health=${health ?? 'n/a'} calls=${calls ?? 'n/a'} costUsd=${cost ?? 'n/a'} with ${historyCount} persisted history entr${entryCount} and status=${status}.`,
		history: `History view returned ${historyCount} persisted snapshot entr${entryCount} with explicit trend status=${status}.`,
		usage: `Usage view reports ${calls ?? 'n/a'} call(s), ${state.snapshot.usage.errors.value ?? 'n/a'} error(s) and status=${status}.`,
		economics: `Economics view reports cost=${cost ?? 'n/a'} and tokenSavings=${state.snapshot.usage.tokensSaved.value ?? 'n/a'} with status=${status}.`,
		models: `Models view uses raw invocation attribution when available and stays explicit about unattributed windows; status=${status}.`,
		agents: `Agents view groups observed usage by agent identity within the selected window; status=${status}.`,
		plugins: `Plugins view highlights observed plugin activity and utility without inventing missing economics; status=${status}.`,
		errors: `Errors view surfaces structured classifications and incongruence evidence only when telemetry exists; status=${status}.`,
		efficiency: `Efficiency view reuses measured usage KPIs and leaves unavailable savings or latency fields explicit; status=${status}.`,
		audit: `Audit view reports only evidence-backed anomalies and missing-source conditions; status=${status}.`,
		activation: `Activation view reports precision, recall and churn across ${state.activation?.sessionCount ?? 0} recorded session(s); status=${status}.`,
	};
	return summaries[view];
};

const stateActivationStatus = (state: IToolSourceState): TKpiViewStatus =>
	state.activationExists
		? state.activation === null
			? 'unavailable'
			: state.activation.sessionCount > 0
				? 'measured'
				: 'partial'
		: 'not-configured';

const buildViewPayload = async (
	query: IResolvedQuery,
	options: IProjectKpisToolOptions,
): Promise<IProjectKpisOutput> => {
	const state = await loadState(query, options);
	const snapshot = buildSnapshotSection(state, query);
	const history = buildHistorySection(state, query);
	const breakdowns = buildBreakdowns(state, query);
	const issues = buildIssuesSection(state, query);
	const findings = findingsOf(state, query);
	const view = query.view ?? 'summary';
	const statusResolvers: Record<TProjectKpiView, () => TKpiViewStatus> = {
		history: () => history.status,
		models: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
			]),
		agents: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
			]),
		plugins: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
			]),
		usage: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
			]),
		economics: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
			]),
		errors: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
				issues.status,
			]),
		efficiency: () =>
			deriveViewStatus([
				snapshot.status,
				...breakdowns.map((item) => item.status),
			]),
		audit: () => findings.status,
		activation: () => stateActivationStatus(state),
		summary: () => deriveViewStatus([snapshot.status, history.status]),
	};
	const status = statusResolvers[view]();
	const raw: Omit<
		IProjectKpisOutput,
		'bytes' | 'truncated' | 'originalBytes'
	> = {
		contract: 'project-kpis.view',
		version: 1,
		view,
		detail: query.detail,
		status,
		generatedAt: asIsoString(state.now),
		window: {
			from: query.from,
			to: query.to,
			windowDays: query.windowDays,
			limit: query.limit,
		},
		dimensions: [...query.dimensions],
		...(query.filter !== undefined ? { filter: query.filter } : {}),
		summary: viewSummaryOf(view, state, status),
		sources: sourcesOf(state),
		privacy: {
			observedMcpOnly: true,
			limitations: limitationsOf(state),
		},
		recommendations: recommendationsOf(
			options.namespacePrefix,
			state.snapshot.health.next,
			state,
		).slice(0, DETAIL_LIMITS[query.detail].recommendations),
		...(view === 'audit' ? {} : { snapshot }),
		...(view === 'activation'
			? {
					activation: {
						status,
						source: 'activation-kpis/.vscode/mcp-vertex/kpis.json',
						sessionCount: state.activation?.sessionCount ?? 0,
						...(state.activation?.meanPrecision !== undefined
							? { meanPrecision: state.activation.meanPrecision }
							: {}),
						...(state.activation?.meanRecall !== undefined
							? { meanRecall: state.activation.meanRecall }
							: {}),
						...(state.activation?.meanChurn !== undefined
							? { meanChurn: state.activation.meanChurn }
							: {}),
						...(state.activation === null
							? {
									note: 'Activation KPI file exists but could not be parsed.',
								}
							: {}),
					},
				}
			: {}),
		...(view === 'history' || view === 'summary' || view === 'economics'
			? { history }
			: {}),
		...(view === 'errors' ? { issues } : {}),
		...(view === 'audit' ? { findings } : {}),
		...(view === 'summary' ||
		view === 'usage' ||
		view === 'economics' ||
		view === 'models' ||
		view === 'agents' ||
		view === 'plugins' ||
		view === 'errors' ||
		view === 'efficiency'
			? { breakdowns }
			: {}),
	};
	return fitToBudget(raw, query.maxBytes);
};

export const runProjectKpis = async (
	args: IProjectKpisToolArgs,
	options: IProjectKpisToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass view plus optional windowDays/from/to, dimensions, detail and filter values.',
		);
	}
	return toolJson(
		await buildViewPayload(normalizeQuery(parsed.data, options), options),
	);
};

export const buildProjectKpisToolRegistrations = (
	options: IProjectKpisToolOptions,
): IToolRegistration[] => [
	{
		id: 'project_kpis',
		tags: ['observability', 'aggregation', 'compact'],
		summary:
			'Bounded KPI views across snapshot, history, usage, economics, models, agents, plugins, errors, efficiency and audit.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_project_kpis`,
				{
					description:
						'Return bounded KPI views for summary, history, usage, economics, models, agents, plugins, errors, efficiency and audit. Every response keeps explicit source status, privacy limits, recommendations and time-window or dimension filters without inventing missing data.',
					inputSchema: InputSchema,
					outputSchema: ProjectKpisOutputSchema,
				},
				async (args: IProjectKpisToolArgs) =>
					runProjectKpis(args, options),
			);
		},
	},
];

export {
	InputSchema as ProjectKpisInputSchema,
	ProjectKpisOutputSchema,
	DEFAULT_KPI_MAX_BYTES,
	DEFAULT_KPI_WINDOW_DAYS,
};
