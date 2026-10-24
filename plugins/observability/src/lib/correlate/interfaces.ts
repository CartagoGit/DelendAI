import type { IObsIssue } from '../errors/ierror-source';

export interface IReadonlyLocalLogLine {
	readonly ts: string;
	readonly logFile: string;
	readonly line: string;
	readonly lineNumber: number;
}

export interface IReadonlyLocalMetricRecord {
	readonly ts: string;
	readonly name: string;
	readonly value: number | string | boolean | null;
}

export interface ICorrelateErrorsWithLocalInput {
	readonly issues: readonly IObsIssue[];
	readonly localLogs: readonly IReadonlyLocalLogLine[];
	readonly localMetrics?: readonly IReadonlyLocalMetricRecord[];
	readonly now: Date;
	readonly sinceMinutes?: number;
}

export interface IObsCorrelationMatch {
	readonly issueId: string;
	readonly logFile: string;
	readonly line: number;
	readonly summary: string;
}

export interface ICorrelateErrorsWithLocalOutput {
	readonly matches: readonly IObsCorrelationMatch[];
}

export interface IReadLocalCorrelateFilter {
	readonly since?: string;
}

export interface IReadLocalCorrelateDeps {
	listLocalLogs(
		filter?: IReadLocalCorrelateFilter,
	): Promise<readonly IReadonlyLocalLogLine[]>;
	listLocalMetrics(
		filter?: IReadLocalCorrelateFilter,
	): Promise<readonly IReadonlyLocalMetricRecord[]>;
}

export interface ILocalLogEvent {
	readonly ts: string;
	readonly summary: string;
	readonly taskId?: string | null;
	readonly agent?: string | null;
	readonly outcome?: string;
}

export type IIssueLogMatchReason = 'issue-id' | 'project' | 'title' | 'context';

export interface IIssueLogMatch {
	readonly event: ILocalLogEvent;
	readonly reasons: readonly IIssueLogMatchReason[];
}

export interface IIssueLogCorrelation {
	readonly issue: IObsIssue;
	readonly windowStart: string;
	readonly windowEnd: string;
	readonly matches: readonly IIssueLogMatch[];
}

export interface ICorrelateIssuesOptions {
	readonly windowMs?: number;
	readonly maxMatchesPerIssue?: number;
}
