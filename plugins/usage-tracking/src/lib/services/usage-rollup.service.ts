// effect-boundary-authorized: Maintains persisted usage rollups by cleaning orphaned temp siblings around atomic summary writes.
import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type { IInvocationRecordTelemetry } from '../contracts/invocation-record.interface';
import {
	buildSummary,
	readInvocations,
	type IBuildSummaryOptions,
	withinWindow,
} from '../rollup';
import { percentile } from '../statistics.helper';
import { readSummaryFile } from '../summary-file.service';
import type {
	IDegradation,
	IInvocationRecord,
	IUsageSummary,
	SortBy,
} from '../types';
import type { ILimitsConfig } from '../circuit-breaker';

export interface IInvocationTelemetryBucket {
	readonly key: string;
	readonly calls: number;
	readonly successfulCalls: number;
	readonly failedCalls: number;
	readonly retries: number;
	readonly iterationsObserved: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly averageLatencyMs: number | null;
	readonly p50LatencyMs: number | null;
	readonly p95LatencyMs: number | null;
	readonly lastSeenAt: string | null;
	readonly latestCorrelationId: string | null;
	readonly latestError: string | null;
}

export interface IInvocationTelemetryIssue {
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
}

export interface IInvocationTelemetryTotals {
	readonly calls: number;
	readonly successfulCalls: number;
	readonly failedCalls: number;
	readonly retries: number;
	readonly iterationsObserved: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly averageLatencyMs: number | null;
	readonly p50LatencyMs: number | null;
	readonly p95LatencyMs: number | null;
	readonly withCorrelation: number;
	readonly schemaIncongruences: number;
}

export interface IInvocationTelemetryRollup {
	readonly generatedAt: string;
	readonly windowDays: number;
	readonly totals: IInvocationTelemetryTotals;
	readonly byPlugin: readonly IInvocationTelemetryBucket[];
	readonly byTool: readonly IInvocationTelemetryBucket[];
	readonly byModel: readonly IInvocationTelemetryBucket[];
	readonly byAgent: readonly IInvocationTelemetryBucket[];
	readonly byRequestType: readonly IInvocationTelemetryBucket[];
	readonly byOutcome: readonly IInvocationTelemetryBucket[];
	readonly byError: readonly IInvocationTelemetryBucket[];
	readonly byDay: readonly IInvocationTelemetryBucket[];
	readonly issues: readonly IInvocationTelemetryIssue[];
}

type InvocationTelemetrySummary = IUsageSummary & {
	readonly invocationTelemetry: IInvocationTelemetryRollup;
};

const MAX_ISSUES = 50;
const ISO_DATE_LENGTH = 10;

const removeSummarySiblingTmpFiles = async (absPath: string): Promise<void> => {
	const dir = dirname(absPath);
	const prefix = `${basename(absPath)}.`;
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	await Promise.all(
		entries
			.filter(
				(entry) =>
					entry.isFile() &&
					entry.name.startsWith(prefix) &&
					entry.name.endsWith('.tmp'),
			)
			.map((entry) => rm(join(dir, entry.name), { force: true })),
	);
};

const dateKeyOf = (ts: string): string => {
	const parsed = Date.parse(ts);
	if (Number.isNaN(parsed)) return 'unknown';
	return new Date(parsed).toISOString().slice(0, ISO_DATE_LENGTH);
};

const latencyOf = (record: IInvocationRecordTelemetry): number | null => {
	const value = record.latencyMs ?? record.durationMs;
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const totalTokensOf = (record: IInvocationRecordTelemetry): number => {
	const total = record.tokenCount ?? record.usage?.totalTokens;
	if (typeof total === 'number' && Number.isFinite(total)) return total;
	return (record.usage?.inputTokens ?? 0) + (record.usage?.outputTokens ?? 0);
};

const bucketKeyResolvers = {
	plugin: (record: IInvocationRecordTelemetry) => record.plugin,
	tool: (record: IInvocationRecordTelemetry) =>
		`${record.plugin}/${record.tool}`,
	model: (record: IInvocationRecordTelemetry) =>
		record.dimensions?.model ?? 'unattributed',
	agent: (record: IInvocationRecordTelemetry) => record.agent.kind,
	requestType: (record: IInvocationRecordTelemetry) =>
		record.requestType ?? 'unknown',
	outcome: (record: IInvocationRecordTelemetry) => record.outcome,
	error: (record: IInvocationRecordTelemetry) =>
		record.errorTelemetry?.classification ?? 'none',
	day: (record: IInvocationRecordTelemetry) => dateKeyOf(record.ts),
} as const;

type BucketAxis = keyof typeof bucketKeyResolvers;

const sortBuckets = (
	buckets: readonly IInvocationTelemetryBucket[],
	sortBy: SortBy = 'calls',
): IInvocationTelemetryBucket[] => {
	const key =
		sortBy === 'costUsd'
			? 'costUsd'
			: sortBy === 'totalTokens'
				? 'totalTokens'
				: 'calls';
	return [...buckets].sort((left, right) => {
		const primary = right[key] - left[key];
		if (primary !== 0) return primary;
		return left.key.localeCompare(right.key);
	});
};

const summarizeLatencies = (
	latencies: readonly number[],
): Pick<
	IInvocationTelemetryBucket,
	'averageLatencyMs' | 'p50LatencyMs' | 'p95LatencyMs'
> => {
	if (latencies.length === 0) {
		return {
			averageLatencyMs: null,
			p50LatencyMs: null,
			p95LatencyMs: null,
		};
	}
	const sum = latencies.reduce((acc, value) => acc + value, 0);
	return {
		averageLatencyMs: Math.round((sum / latencies.length) * 1000) / 1000,
		p50LatencyMs: percentile(latencies, 0.5),
		p95LatencyMs: percentile(latencies, 0.95),
	};
};

const bucketByAxis = (
	records: readonly IInvocationRecordTelemetry[],
	axis: BucketAxis,
	sortBy: SortBy = 'calls',
): IInvocationTelemetryBucket[] => {
	const groups = new Map<string, IInvocationRecordTelemetry[]>();
	for (const record of records) {
		const key = bucketKeyResolvers[axis](record);
		const existing = groups.get(key);
		if (existing) existing.push(record);
		else groups.set(key, [record]);
	}
	const buckets = [...groups.entries()].map(([key, group]) => {
		const latencies = group
			.map((record) => latencyOf(record))
			.filter((value): value is number => value !== null);
		const successfulCalls = group.reduce(
			(acc, record) => acc + (record.outcome === 'success' ? 1 : 0),
			0,
		);
		const failedCalls = group.length - successfulCalls;
		const retries = group.reduce(
			(acc, record) => acc + (record.retry ? 1 : 0),
			0,
		);
		const iterationsObserved = group.reduce(
			(acc, record) => acc + Math.max(record.iteration ?? 0, 0),
			0,
		);
		const latest = group.at(-1) ?? null;
		return {
			key,
			calls: group.length,
			successfulCalls,
			failedCalls,
			retries,
			iterationsObserved,
			inputTokens: group.reduce(
				(acc, record) => acc + (record.usage?.inputTokens ?? 0),
				0,
			),
			outputTokens: group.reduce(
				(acc, record) => acc + (record.usage?.outputTokens ?? 0),
				0,
			),
			totalTokens: group.reduce(
				(acc, record) => acc + totalTokensOf(record),
				0,
			),
			costUsd: group.reduce(
				(acc, record) => acc + (record.costUsd ?? 0),
				0,
			),
			...summarizeLatencies(latencies),
			lastSeenAt: latest?.ts ?? null,
			latestCorrelationId: latest?.correlation?.id ?? null,
			latestError: latest?.errorTelemetry?.classification ?? null,
		};
	});
	const sorted = sortBuckets(buckets, sortBy);
	if (axis !== 'error') return sorted;
	return [...sorted].sort((left, right) => {
		if (left.key === 'none' && right.key !== 'none') return 1;
		if (left.key !== 'none' && right.key === 'none') return -1;
		return 0;
	});
};

const buildIssues = (
	records: readonly IInvocationRecordTelemetry[],
): IInvocationTelemetryIssue[] =>
	records
		.filter(
			(record) =>
				record.errorTelemetry !== null &&
				record.errorTelemetry !== undefined,
		)
		.slice()
		.sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
		.slice(0, MAX_ISSUES)
		.map((record) => ({
			ts: record.ts,
			plugin: record.plugin,
			tool: record.tool,
			requestType: record.requestType ?? 'unknown',
			outcome: record.outcome,
			correlationId: record.correlation?.id ?? null,
			classification: record.errorTelemetry?.classification ?? 'unknown',
			code: record.errorTelemetry?.code ?? 'unknown',
			message: record.errorTelemetry?.message ?? 'unknown',
			incongruence: record.errorTelemetry?.incongruence ?? false,
			iteration: record.iteration ?? null,
		}));

export const buildInvocationTelemetryRollup = (
	records: readonly IInvocationRecord[],
	windowDays: number,
	now: number = Date.now(),
): IInvocationTelemetryRollup => {
	const telemetryRecords = withinWindow(
		records,
		windowDays,
		now,
	) as IInvocationRecordTelemetry[];
	const latencies = telemetryRecords
		.map((record) => latencyOf(record))
		.filter((value): value is number => value !== null);
	const successfulCalls = telemetryRecords.reduce(
		(acc, record) => acc + (record.outcome === 'success' ? 1 : 0),
		0,
	);
	const failedCalls = telemetryRecords.length - successfulCalls;
	const retries = telemetryRecords.reduce(
		(acc, record) => acc + (record.retry ? 1 : 0),
		0,
	);
	const iterationsObserved = telemetryRecords.reduce(
		(acc, record) => acc + Math.max(record.iteration ?? 0, 0),
		0,
	);
	const schemaIncongruences = telemetryRecords.reduce(
		(acc, record) => acc + (record.errorTelemetry?.incongruence ? 1 : 0),
		0,
	);
	return {
		generatedAt: new Date(now).toISOString(),
		windowDays,
		totals: {
			calls: telemetryRecords.length,
			successfulCalls,
			failedCalls,
			retries,
			iterationsObserved,
			inputTokens: telemetryRecords.reduce(
				(acc, record) => acc + (record.usage?.inputTokens ?? 0),
				0,
			),
			outputTokens: telemetryRecords.reduce(
				(acc, record) => acc + (record.usage?.outputTokens ?? 0),
				0,
			),
			totalTokens: telemetryRecords.reduce(
				(acc, record) => acc + totalTokensOf(record),
				0,
			),
			costUsd: telemetryRecords.reduce(
				(acc, record) => acc + (record.costUsd ?? 0),
				0,
			),
			...summarizeLatencies(latencies),
			withCorrelation: telemetryRecords.reduce(
				(acc, record) => acc + (record.correlation?.id ? 1 : 0),
				0,
			),
			schemaIncongruences,
		},
		byPlugin: bucketByAxis(telemetryRecords, 'plugin', 'calls'),
		byTool: bucketByAxis(telemetryRecords, 'tool', 'calls'),
		byModel: bucketByAxis(telemetryRecords, 'model', 'totalTokens'),
		byAgent: bucketByAxis(telemetryRecords, 'agent', 'calls'),
		byRequestType: bucketByAxis(telemetryRecords, 'requestType', 'calls'),
		byOutcome: bucketByAxis(telemetryRecords, 'outcome', 'calls'),
		byError: bucketByAxis(telemetryRecords, 'error', 'calls'),
		byDay: bucketByAxis(telemetryRecords, 'day', 'calls'),
		issues: buildIssues(telemetryRecords),
	};
};

const writeSummaryUnlocked = async (
	absPath: string,
	summary: InvocationTelemetrySummary,
): Promise<void> => {
	await removeSummarySiblingTmpFiles(absPath);
	const { text } = redactSecrets(`${JSON.stringify(summary, null, '\t')}\n`);
	await writeFileAtomic(absPath, text);
};

export const regenerateUsageSummary = async (
	invocationsPath: string,
	summaryPath: string,
	windowDays: number,
	now: number = Date.now(),
	limits?: ILimitsConfig | undefined,
	options: Omit<IBuildSummaryOptions, 'limits'> = {},
): Promise<InvocationTelemetrySummary> => {
	const records = await readInvocations(invocationsPath);
	return withFileMutex(summaryPath, async () => {
		const prior = await readSummaryFile(summaryPath);
		const summary = buildSummary(records, windowDays, now, {
			limits,
			degradations:
				options.degradations ??
				(prior?.degradations as readonly IDegradation[] | undefined) ??
				[],
		});
		const enriched = {
			...summary,
			invocationTelemetry: buildInvocationTelemetryRollup(
				records,
				windowDays,
				now,
			),
		} satisfies InvocationTelemetrySummary;
		await writeSummaryUnlocked(summaryPath, enriched);
		return enriched;
	});
};
