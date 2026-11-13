import { compareCodeUnits } from '@delendai/state';

import type {
	IInvocationTelemetryBucket,
	IInvocationTelemetryIssue,
} from '../contracts/usage-rollup.interface';
import type { IInvocationRecordTelemetry } from '../contracts/invocation-record.interface';
import { agentKindOf } from '../detect-agent';
import { percentile } from '../statistics.helper';
import type { SortBy } from '../types';

const MAX_ISSUES = 50;
const ISO_DATE_LENGTH = 10;

const dateKeyOf = (ts: string): string => {
	const parsed = Date.parse(ts);
	if (Number.isNaN(parsed)) return 'unknown';
	return new Date(parsed).toISOString().slice(0, ISO_DATE_LENGTH);
};

export const latencyOf = (
	record: IInvocationRecordTelemetry,
): number | null => {
	const value = record.latencyMs ?? record.durationMs;
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export const totalTokensOf = (record: IInvocationRecordTelemetry): number => {
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
	agent: ({ agent }: IInvocationRecordTelemetry) => agentKindOf(agent.kind),
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
	return [...buckets].sort(
		(left, right) =>
			right[key] - left[key] || compareCodeUnits(left.key, right.key),
	);
};

export const summarizeLatencies = (
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

export const bucketByAxis = (
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

export const buildIssues = (
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
