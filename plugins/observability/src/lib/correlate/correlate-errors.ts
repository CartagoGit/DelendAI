import type {
	ICorrelateErrorsWithLocalInput,
	ICorrelateErrorsWithLocalOutput,
	IObsCorrelationMatch,
	IReadonlyLocalLogLine,
} from './interfaces';
import { correlateIssuesWithLogs } from './issue-log-correlator';

export const DEFAULT_CORRELATE_WINDOW_MINUTES = 1_440;

const normalize = (value: string | undefined): string =>
	(value ?? '').trim().toLowerCase();

const truncate = (value: string, max = 140): string =>
	value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const hasTsInWindow = (
	ts: string,
	now: Date,
	sinceMinutes: number,
): boolean => {
	const ms = new Date(ts).getTime();
	if (Number.isNaN(ms)) return false;
	return ms >= now.getTime() - sinceMinutes * 60_000;
};

const summarizeMatch = (
	issueTitle: string,
	log: IReadonlyLocalLogLine,
): string =>
	`${issueTitle} matched local log ${log.logFile}:${log.lineNumber} — ${truncate(log.line)}`;

const compareMatches = (
	left: IObsCorrelationMatch,
	right: IObsCorrelationMatch,
): number => {
	const fileCompare = left.logFile.localeCompare(right.logFile);
	if (fileCompare !== 0) return fileCompare;
	if (left.line !== right.line) return left.line - right.line;
	return left.issueId.localeCompare(right.issueId);
};

const matchesIssueText = (
	issue: ICorrelateErrorsWithLocalInput['issues'][number],
	log: IReadonlyLocalLogLine,
): boolean => {
	const title = normalize(issue.title);
	if (title.length > 0) return normalize(log.line).includes(title);
	const context = normalize(issue.context);
	return context.length > 0 && normalize(log.line).includes(context);
};

export const correlateErrorsWithLocal = (
	input: ICorrelateErrorsWithLocalInput,
): ICorrelateErrorsWithLocalOutput => {
	const sinceMinutes = input.sinceMinutes ?? DEFAULT_CORRELATE_WINDOW_MINUTES;
	const recentLogs = input.localLogs.filter((log) =>
		hasTsInWindow(log.ts, input.now, sinceMinutes),
	);
	const matches: IObsCorrelationMatch[] = [];
	const grouped = correlateIssuesWithLogs(
		input.issues,
		recentLogs.map((log) => ({
			ts: log.ts,
			summary: log.line,
		})),
		{ windowMs: sinceMinutes * 60_000 },
	);
	for (const row of grouped) {
		for (const match of row.matches) {
			const log = recentLogs.find(
				(candidate) =>
					candidate.ts === match.event.ts &&
					candidate.line === match.event.summary,
			);
			if (log === undefined || !matchesIssueText(row.issue, log))
				continue;
			matches.push({
				issueId: row.issue.id,
				logFile: log.logFile,
				line: log.lineNumber,
				summary: summarizeMatch(row.issue.title, log),
			});
		}
	}
	return { matches: matches.sort(compareMatches) };
};
