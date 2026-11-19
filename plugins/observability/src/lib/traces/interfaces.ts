import type { FindingSeverity, IFindingCounts } from '@delendai/core/public';

export interface IReadTracesFilter {
	readonly limit?: number;
	readonly service?: string;
}

export interface IReadReleaseHealthFilter {
	readonly limit?: number;
	readonly version?: string;
}

export interface IReadonlyTraceRecord {
	readonly service: string;
	readonly traceId: string;
	readonly ts: string;
	readonly isError: boolean;
	readonly errorMessage?: string;
}

export interface ITraceSummary {
	readonly service: string;
	readonly traceId: string;
	readonly hourBucket: string;
	readonly count: number;
	readonly errorRate: number;
	readonly topError: string | null;
}

export interface IReadonlyReleaseHealthRecord {
	readonly version: string;
	readonly sessionId: string;
	readonly crashed: boolean;
	readonly ts?: string;
}

export interface IReleaseHealth {
	readonly version: string;
	readonly totalSessions: number;
	readonly crashCount: number;
	readonly crashFreeRate: number;
}

export interface IReleaseHealthSummary {
	readonly summary: IFindingCounts;
	readonly worst: FindingSeverity | null;
}

export interface IReadTracesDeps {
	listTraceRecords(
		filter?: IReadTracesFilter,
	): Promise<readonly IReadonlyTraceRecord[]>;
}

export interface IReadReleaseHealthDeps {
	listReleaseHealthRecords(
		filter?: IReadReleaseHealthFilter,
	): Promise<readonly IReadonlyReleaseHealthRecord[]>;
}

export const fakeReadTracesDeps = (
	records: readonly IReadonlyTraceRecord[],
): IReadTracesDeps => ({
	listTraceRecords: async (filter) => {
		const filtered = records.filter((record) =>
			filter?.service === undefined
				? true
				: record.service === filter.service,
		);
		if (filter?.limit === undefined) return filtered;
		return filtered.slice(0, filter.limit);
	},
});

export const fakeReadReleaseHealthDeps = (
	records: readonly IReadonlyReleaseHealthRecord[],
): IReadReleaseHealthDeps => ({
	listReleaseHealthRecords: async (filter) => {
		const filtered = records.filter((record) =>
			filter?.version === undefined
				? true
				: record.version === filter.version,
		);
		if (filter?.limit === undefined) return filtered;
		return filtered.slice(0, filter.limit);
	},
});
