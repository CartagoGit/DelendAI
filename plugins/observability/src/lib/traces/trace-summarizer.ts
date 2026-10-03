import {
	summarizeFindings,
	type FindingSeverity,
	type IFinding,
	worstSeverity,
} from '@delendai/core/public';

import type {
	IReadonlyTraceRecord,
	IReleaseHealthSummary,
	ITraceSummary,
} from './interfaces';

const hourBucketOf = (ts: string): string => {
	const date = new Date(ts);
	if (Number.isNaN(date.getTime())) return 'unknown';
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const hour = String(date.getUTCHours()).padStart(2, '0');
	return `${year}-${month}-${day}T${hour}:00:00Z`;
};

const traceSeverity = (group: ITraceSummary): FindingSeverity => {
	if (group.errorRate >= 0.75) return 'critical';
	if (group.errorRate >= 0.5) return 'high';
	if (group.errorRate >= 0.2) return 'medium';
	if (group.errorRate > 0) return 'low';
	return 'info';
};

const toFinding = (group: ITraceSummary): IFinding => ({
	ruleId: 'obs_trace',
	severity: traceSeverity(group),
	message: `${group.service}/${group.traceId} @ ${group.hourBucket} — ${group.count} record(s), error rate ${group.errorRate}`,
	...(group.topError !== null ? { fix: group.topError } : {}),
});

export const groupRecordsByTrace = (
	records: readonly IReadonlyTraceRecord[],
): readonly ITraceSummary[] => {
	const groups = new Map<
		string,
		{
			service: string;
			traceId: string;
			hourBucket: string;
			count: number;
			errorCount: number;
			errors: Map<string, number>;
		}
	>();
	for (const record of records) {
		const hourBucket = hourBucketOf(record.ts);
		const key = `${record.service}\u0000${record.traceId}\u0000${hourBucket}`;
		const entry = groups.get(key) ?? {
			service: record.service,
			traceId: record.traceId,
			hourBucket,
			count: 0,
			errorCount: 0,
			errors: new Map<string, number>(),
		};
		entry.count += 1;
		if (record.isError) {
			entry.errorCount += 1;
			if (
				record.errorMessage !== undefined &&
				record.errorMessage.length > 0
			) {
				entry.errors.set(
					record.errorMessage,
					(entry.errors.get(record.errorMessage) ?? 0) + 1,
				);
			}
		}
		groups.set(key, entry);
	}
	return [...groups.values()]
		.map((entry) => {
			const sortedErrors = [...entry.errors.entries()].sort(
				(left, right) => {
					if (right[1] !== left[1]) return right[1] - left[1];
					return left[0].localeCompare(right[0]);
				},
			);
			return {
				service: entry.service,
				traceId: entry.traceId,
				hourBucket: entry.hourBucket,
				count: entry.count,
				errorRate: entry.errorCount / entry.count,
				topError: sortedErrors[0]?.[0] ?? null,
			};
		})
		.sort((left, right) => {
			if (right.count !== left.count) return right.count - left.count;
			if (right.errorRate !== left.errorRate)
				return right.errorRate - left.errorRate;
			const serviceCompare = left.service.localeCompare(right.service);
			if (serviceCompare !== 0) return serviceCompare;
			const traceCompare = left.traceId.localeCompare(right.traceId);
			if (traceCompare !== 0) return traceCompare;
			return left.hourBucket.localeCompare(right.hourBucket);
		});
};

export const summarizeTraceGroups = (
	groups: readonly ITraceSummary[],
): IReleaseHealthSummary => {
	const findings = groups.map(toFinding);
	return {
		summary: summarizeFindings(findings),
		worst: worstSeverity(findings) ?? null,
	};
};

export const severityForTraceSummary = traceSeverity;
