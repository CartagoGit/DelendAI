// effect-boundary-authorized: Reads persisted usage-tracking artifacts to assemble KPI snapshots when source rollups already live on disk.
import { access } from 'node:fs/promises';

import { truncateIfTooLarge } from '@delendai/core/public';
import {
	buildSummary,
	readInvocations,
	readSummary,
	type IInvocationRecord,
	type IUsageSummary,
} from '@delendai/usage-tracking/public';
import {
	runProjectHealth,
	type IProjectHealthOutput,
} from '@delendai/project-health/public';

import type {
	IKpiAggregationOptions,
	IKpiDeliverySection,
	IKpiHealthSection,
	IKpiMetric,
	IKpiSnapshot,
	IKpiTopPlugin,
	IKpiUsageSection,
	TKpiMetricUnit,
	TKpiValueStatus,
} from '../contracts/kpi-snapshot.interface';

export const DEFAULT_KPI_WINDOW_DAYS = 7;
export const DEFAULT_KPI_MAX_BYTES = 12_000;
const HEALTH_DETAIL_MAX_BYTES = 4_096;
const TOP_PLUGIN_LIMIT = 5;

const asIsoString = (value: Date): string => value.toISOString();

const metric = (
	status: TKpiValueStatus,
	unit: TKpiMetricUnit,
	source: string,
	options: {
		value?: number;
		observedAt?: string;
		note?: string;
	} = {},
): IKpiMetric => ({
	status,
	unit,
	source,
	...(options.value !== undefined ? { value: options.value } : {}),
	...(options.observedAt !== undefined
		? { observedAt: options.observedAt }
		: {}),
	...(options.note !== undefined ? { note: options.note } : {}),
});

const parseToolPayload = <TPayload>(result: {
	readonly content: readonly { readonly text: string }[];
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}): TPayload => {
	if (result.isError) {
		throw new Error('tool adapter returned an error envelope');
	}
	if (result.structuredContent !== undefined) {
		return result.structuredContent as TPayload;
	}
	const first = result.content[0];
	if (first === undefined) {
		throw new Error('tool adapter returned no content');
	}
	return JSON.parse(first.text) as TPayload;
};

const buildHealthSection = async (
	options: IKpiAggregationOptions,
	generatedAt: string,
): Promise<IKpiHealthSection> => {
	const source = '@delendai/project-health/public#runProjectHealth';
	try {
		const payload = parseToolPayload<IProjectHealthOutput>(
			await (options.runProjectHealth ?? runProjectHealth)(
				{ domain: 'summary' },
				{
					namespacePrefix: options.namespacePrefix,
					workspaceRootAbs: options.workspaceRootAbs,
					maxBytes: Math.min(
						options.maxBytes ?? DEFAULT_KPI_MAX_BYTES,
						HEALTH_DETAIL_MAX_BYTES,
					),
				},
			),
		);
		return {
			status: 'estimated',
			source,
			score: metric('estimated', 'score', source, {
				...(payload.score !== undefined
					? { value: payload.score }
					: {}),
				observedAt: generatedAt,
				note: 'Summary is heuristic-only and delegates deep scans to the owning plugins.',
			}),
			security: metric(
				payload.security === undefined ? 'unavailable' : 'estimated',
				'score',
				source,
				{
					...(payload.security !== undefined
						? { value: payload.security }
						: {
								note: 'Project-health summary did not surface a security score.',
							}),
					observedAt: generatedAt,
				},
			),
			deps: metric(
				payload.deps === undefined ? 'unavailable' : 'estimated',
				'score',
				source,
				{
					...(payload.deps !== undefined
						? { value: payload.deps }
						: {
								note: 'Project-health summary did not surface a dependency score.',
							}),
					observedAt: generatedAt,
				},
			),
			quality: metric(
				payload.quality === undefined ? 'unavailable' : 'estimated',
				'score',
				source,
				{
					...(payload.quality !== undefined
						? { value: payload.quality }
						: {
								note: 'Project-health summary did not surface a quality score.',
							}),
					observedAt: generatedAt,
				},
			),
			debt: metric(
				payload.debt === undefined ? 'unavailable' : 'estimated',
				'score',
				source,
				{
					...(payload.debt !== undefined
						? { value: payload.debt }
						: {
								note: 'Project-health summary did not surface a debt score.',
							}),
					observedAt: generatedAt,
				},
			),
			next: [...(payload.next ?? [])],
			note: 'Values are compact estimates reused from project-health; deep scanners remain lazy and owned by their source plugins.',
		};
	} catch (error) {
		const reason =
			error instanceof Error
				? error.message
				: 'unknown project-health failure';
		const unavailable = metric('unavailable', 'score', source, {
			observedAt: generatedAt,
			note: reason,
		});
		return {
			status: 'unavailable',
			source,
			score: unavailable,
			security: unavailable,
			deps: unavailable,
			quality: unavailable,
			debt: unavailable,
			next: [],
			note: `Project-health aggregation failed: ${reason}`,
		};
	}
};

const buildUsageSummaryFromSources = async (
	options: IKpiAggregationOptions,
	windowDays: number,
	nowMs: number,
): Promise<{
	readonly status: TKpiValueStatus;
	readonly summary: IUsageSummary | null;
	readonly records: readonly IInvocationRecord[];
	readonly note?: string;
}> => {
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
	const [summaryExists, invocationsExists] = await Promise.all([
		pathExists(options.usageSummaryPathAbs),
		pathExists(options.usageInvocationsPathAbs),
	]);
	const readUsageInvocations =
		options.readUsageInvocations ?? readInvocations;
	const readUsageSummary = options.readUsageSummary ?? readSummary;
	const buildUsage = options.buildUsageSummary ?? buildSummary;

	if (!summaryExists && !invocationsExists) {
		return {
			status: 'not-configured',
			summary: null,
			records: [],
			note: 'Usage-tracking results were not found under the canonical results cache.',
		};
	}

	if (invocationsExists) {
		const records = await readUsageInvocations(
			options.usageInvocationsPathAbs,
		);
		return {
			status: 'measured',
			summary: buildUsage(records, windowDays, nowMs),
			records,
			...(records.length === 0
				? {
						note: 'Usage-tracking log exists but the selected window has no invocations.',
					}
				: {}),
		};
	}

	const summary = await readUsageSummary(options.usageSummaryPathAbs);
	if (summary === null) {
		return {
			status: 'unavailable',
			summary: null,
			records: [],
			note: 'Usage-tracking summary exists but could not be read as a valid rollup.',
		};
	}

	return {
		status: 'measured',
		summary,
		records: [],
		note: 'Built from the persisted usage summary because the raw invocation log was unavailable.',
	};
};

const topPluginsFrom = (summary: IUsageSummary): IKpiTopPlugin[] =>
	summary.byPlugin.slice(0, TOP_PLUGIN_LIMIT).map((bucket) => ({
		plugin: bucket.key,
		calls: bucket.calls,
		errors: bucket.errors,
		totalTokens: bucket.totalTokens,
		costUsd: bucket.costUsd,
	}));

const buildUsageSection = async (
	options: IKpiAggregationOptions,
	generatedAt: string,
	windowDays: number,
	nowMs: number,
): Promise<IKpiUsageSection> => {
	const source = '@delendai/usage-tracking/public#buildSummary';
	const usage = await buildUsageSummaryFromSources(
		options,
		windowDays,
		nowMs,
	);
	if (usage.status !== 'measured' || usage.summary === null) {
		return {
			status: usage.status,
			source,
			calls: metric(usage.status, 'count', source, {
				observedAt: generatedAt,
				...(usage.note !== undefined ? { note: usage.note } : {}),
			}),
			errors: metric(usage.status, 'count', source, {
				observedAt: generatedAt,
				...(usage.note !== undefined ? { note: usage.note } : {}),
			}),
			toolErrorRate: metric(usage.status, 'ratio', source, {
				observedAt: generatedAt,
				...(usage.note !== undefined ? { note: usage.note } : {}),
			}),
			totalTokens: metric('unavailable', 'tokens', source, {
				observedAt: generatedAt,
				note:
					usage.note ??
					'Token totals require raw or rolled-up usage-tracking data.',
			}),
			costUsd: metric('unavailable', 'usd', source, {
				observedAt: generatedAt,
				note: 'Cost is unavailable until a provider reports usage and pricing can be attributed safely.',
			}),
			tokensSaved: metric('unavailable', 'tokens', source, {
				observedAt: generatedAt,
				note: 'Savings are unavailable until usage-tracking records observed token savings.',
			}),
			memoryCompactionSavingsTokens: metric(
				usage.status,
				'tokens',
				source,
				{
					observedAt: generatedAt,
					...(usage.note !== undefined ? { note: usage.note } : {}),
				},
			),
			topPlugins: [],
			...(usage.note !== undefined ? { note: usage.note } : {}),
		};
	}

	const summary = usage.summary;
	const records = usage.records;
	const hasTokenData =
		records.length > 0
			? records.some(
					(record) =>
						record.usage?.totalTokens !== undefined ||
						record.usage?.inputTokens !== undefined ||
						record.usage?.outputTokens !== undefined,
				)
			: summary.totals.calls === 0 || summary.totals.totalTokens > 0;
	const hasCostData =
		records.length > 0
			? records.some((record) => record.costUsd !== null)
			: summary.totals.calls === 0 || summary.totals.costUsd > 0;
	const hasSavingsData =
		records.length > 0
			? records.some((record) => record.tokensSaved !== undefined)
			: summary.totals.calls === 0 || summary.totals.tokensSaved > 0;
	const calls = summary.totals.calls;
	const errors = summary.totals.errors;
	const toolErrorRate = calls === 0 ? 0 : Number((errors / calls).toFixed(4));

	return {
		status: 'measured',
		source,
		calls: metric('measured', 'count', source, {
			value: calls,
			observedAt: summary.updatedAt,
		}),
		errors: metric('measured', 'count', source, {
			value: errors,
			observedAt: summary.updatedAt,
		}),
		toolErrorRate: metric('measured', 'ratio', source, {
			value: toolErrorRate,
			observedAt: summary.updatedAt,
		}),
		totalTokens: metric(
			hasTokenData ? 'measured' : 'unavailable',
			'tokens',
			source,
			{
				...(hasTokenData ? { value: summary.totals.totalTokens } : {}),
				observedAt: summary.updatedAt,
				...(hasTokenData
					? {}
					: {
							note: 'Usage-tracking observed invocations but did not record provider token counts in this window.',
						}),
			},
		),
		costUsd: metric(
			hasCostData ? 'measured' : 'unavailable',
			'usd',
			source,
			{
				...(hasCostData
					? { value: Number(summary.totals.costUsd.toFixed(6)) }
					: {}),
				observedAt: summary.updatedAt,
				...(hasCostData
					? {}
					: {
							note: 'No provider-reported cost or safe pricing attribution was available in this window.',
						}),
			},
		),
		tokensSaved: metric(
			hasSavingsData ? 'measured' : 'unavailable',
			'tokens',
			source,
			{
				...(hasSavingsData
					? { value: summary.totals.tokensSaved }
					: {}),
				observedAt: summary.updatedAt,
				...(hasSavingsData
					? {}
					: {
							note: 'No observed baseline or tokensSaved signal was present in this window.',
						}),
			},
		),
		memoryCompactionSavingsTokens: metric('measured', 'tokens', source, {
			value: summary.kpis.memoryCompactionSavingsTokens,
			observedAt: summary.updatedAt,
		}),
		topPlugins: topPluginsFrom(summary),
		...(usage.note !== undefined ? { note: usage.note } : {}),
	};
};

const buildDeliverySection = (): IKpiDeliverySection => ({
	status: 'not-configured',
	source: 'project-kpis/S1',
	note: 'Delivery and proposal-history KPIs are intentionally deferred to later slices so S1 stays on existing health and usage sources only.',
});

const fitSnapshotToBudget = (
	raw: Omit<IKpiSnapshot, 'bytes' | 'truncated' | 'originalBytes'>,
	maxBytes: number,
): IKpiSnapshot => {
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return { ...raw, bytes: direct.finalBytes, truncated: false };
	}
	const candidates: Array<
		Omit<IKpiSnapshot, 'bytes' | 'truncated' | 'originalBytes'>
	> = [
		{
			...raw,
			health: { ...raw.health, next: raw.health.next.slice(0, 3) },
			usage: {
				...raw.usage,
				topPlugins: raw.usage.topPlugins.slice(0, 3),
			},
		},
		{
			...raw,
			health: { ...raw.health, next: [] },
			usage: { ...raw.usage, topPlugins: [] },
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
	const minimal = {
		...raw,
		health: { ...raw.health, next: [] },
		usage: { ...raw.usage, topPlugins: [] },
	};
	const fallback = truncateIfTooLarge(minimal, maxBytes);
	return {
		...minimal,
		bytes: fallback.finalBytes,
		truncated: true,
		originalBytes: direct.originalBytes ?? fallback.originalBytes,
	};
};

export const buildKpiSnapshot = async (
	options: IKpiAggregationOptions,
): Promise<IKpiSnapshot> => {
	const now = options.now ?? new Date();
	const generatedAt = asIsoString(now);
	const windowDays = options.windowDays ?? DEFAULT_KPI_WINDOW_DAYS;
	const maxBytes = options.maxBytes ?? DEFAULT_KPI_MAX_BYTES;
	const nowMs = now.getTime();
	const raw = {
		contract: 'project-kpis.snapshot',
		version: 1,
		generatedAt,
		windowDays,
		health: await buildHealthSection(options, generatedAt),
		usage: await buildUsageSection(options, generatedAt, windowDays, nowMs),
		delivery: buildDeliverySection(),
	} satisfies Omit<IKpiSnapshot, 'bytes' | 'truncated' | 'originalBytes'>;
	return fitSnapshotToBudget(raw, maxBytes);
};
