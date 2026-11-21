import type { IObsIssue } from '../errors/ierror-source';
import type {
	ICorrelateIssuesOptions,
	IIssueLogCorrelation,
	IIssueLogMatch,
	IIssueLogMatchReason,
	ILocalLogEvent,
} from './interfaces';

const DEFAULT_WINDOW_MS = 15 * 60_000;
const DEFAULT_MAX_MATCHES = 50;
const MAX_WINDOW_MS = 24 * 60 * 60_000;
const MAX_MATCHES = 100;
const MIN_TERM_LENGTH = 4;

const normalize = (value: string): string =>
	value
		.toLocaleLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

const termsOf = (value: string): readonly string[] => [
	...new Set(
		normalize(value)
			.split(' ')
			.filter((term) => term.length >= MIN_TERM_LENGTH),
	),
];

const clampWindowMs = (value: number | undefined): number => {
	if (value === undefined || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_WINDOW_MS;
	}
	return Math.min(value, MAX_WINDOW_MS);
};

const clampMaxMatches = (value: number | undefined): number => {
	if (value === undefined || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_MAX_MATCHES;
	}
	return Math.min(Math.floor(value), MAX_MATCHES);
};

const containsPhrase = (haystack: string, needle: string): boolean =>
	needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);

const hasTerms = (haystack: string, terms: readonly string[]): boolean => {
	if (terms.length === 0) return false;
	const matched = terms.filter((term) => containsPhrase(haystack, term));
	return terms.length === 1 ? matched.length === 1 : matched.length >= 2;
};

const matchReasonsFor = (
	issue: IObsIssue,
	event: ILocalLogEvent,
): readonly IIssueLogMatchReason[] => {
	const searchable = normalize(
		[event.summary, event.taskId ?? '', event.agent ?? ''].join(' '),
	);
	const reasons: IIssueLogMatchReason[] = [];
	if (containsPhrase(searchable, normalize(issue.id))) {
		reasons.push('issue-id');
	}
	if (containsPhrase(searchable, normalize(issue.project))) {
		reasons.push('project');
	}
	if (hasTerms(searchable, termsOf(issue.title))) reasons.push('title');
	if (hasTerms(searchable, termsOf(issue.context))) reasons.push('context');
	return reasons;
};

export const correlateIssuesWithLogs = (
	issues: readonly IObsIssue[],
	events: readonly ILocalLogEvent[],
	options: ICorrelateIssuesOptions = {},
): readonly IIssueLogCorrelation[] => {
	const windowMs = clampWindowMs(options.windowMs);
	const maxMatches = clampMaxMatches(options.maxMatchesPerIssue);
	return issues.map((issue) => {
		const issueTime = Date.parse(issue.lastSeen);
		if (Number.isNaN(issueTime)) {
			return {
				issue,
				windowStart: issue.lastSeen,
				windowEnd: issue.lastSeen,
				matches: [],
			};
		}
		const start = issueTime - windowMs;
		const end = issueTime + windowMs;
		const matches: IIssueLogMatch[] = [];
		for (const event of events) {
			const eventTime = Date.parse(event.ts);
			if (
				Number.isNaN(eventTime) ||
				eventTime < start ||
				eventTime > end
			) {
				continue;
			}
			const reasons = matchReasonsFor(issue, event);
			if (reasons.length === 0) continue;
			matches.push({ event, reasons });
			if (matches.length === maxMatches) break;
		}
		return {
			issue,
			windowStart: new Date(start).toISOString(),
			windowEnd: new Date(end).toISOString(),
			matches,
		};
	});
};
