import { describe, expect, it } from 'vitest';

import { correlateErrorsWithLocal } from './correlate-errors';
import type { IReadonlyLocalLogLine } from './interfaces';
import type { IObsIssue } from '../errors/ierror-source';

const now = new Date('2026-07-25T12:00:00.000Z');

const issue = (overrides?: Partial<IObsIssue>): IObsIssue => ({
	id: 'issue-1',
	title: 'TypeError',
	project: 'web',
	level: 'error',
	lastSeen: '2026-07-25T11:59:00.000Z',
	eventCount: 2,
	context: 'Cannot read properties of undefined',
	url: 'https://sentry/issues/1',
	...overrides,
});

const log = (
	overrides?: Partial<IReadonlyLocalLogLine>,
): IReadonlyLocalLogLine => ({
	ts: '2026-07-25T11:58:00.000Z',
	logFile: '.cache/delendai/results/logs/2026-07-25.jsonl',
	line: '{"ts":"2026-07-25T11:58:00.000Z","summary":"tool-failed: TypeError Cannot read properties of undefined"}',
	lineNumber: 4,
	...overrides,
});

describe('correlateErrorsWithLocal', () => {
	it('returns one match per matching issue and log-line pair', () => {
		const result = correlateErrorsWithLocal({
			issues: [
				issue({ id: 'issue-1' }),
				issue({ id: 'issue-2', title: 'ReferenceError' }),
			],
			localLogs: [
				log({ lineNumber: 1 }),
				log({
					lineNumber: 2,
					line: '{"ts":"2026-07-25T11:58:30.000Z","summary":"tool-failed: ReferenceError x is not defined"}',
				}),
			],
			now,
		});

		expect(result.matches).toHaveLength(2);
		expect(result.matches).toEqual([
			{
				issueId: 'issue-1',
				logFile: '.cache/delendai/results/logs/2026-07-25.jsonl',
				line: 1,
				summary:
					'TypeError matched local log .cache/delendai/results/logs/2026-07-25.jsonl:1 — {"ts":"2026-07-25T11:58:00.000Z","summary":"tool-failed: TypeError Cannot read properties of undefined"}',
			},
			{
				issueId: 'issue-2',
				logFile: '.cache/delendai/results/logs/2026-07-25.jsonl',
				line: 2,
				summary:
					'ReferenceError matched local log .cache/delendai/results/logs/2026-07-25.jsonl:2 — {"ts":"2026-07-25T11:58:30.000Z","summary":"tool-failed: ReferenceError x is not defined"}',
			},
		]);
	});

	it('returns zero matches for a non-matching issue', () => {
		const result = correlateErrorsWithLocal({
			issues: [
				issue({ title: 'SyntaxError', context: 'Unexpected token' }),
			],
			localLogs: [log()],
			now,
		});

		expect(result.matches).toEqual([]);
	});

	it('filters out log lines older than the sinceMinutes window', () => {
		const result = correlateErrorsWithLocal({
			issues: [issue()],
			localLogs: [
				log({
					ts: '2026-07-25T11:59:00.000Z',
					lineNumber: 1,
				}),
				log({
					ts: '2026-07-25T08:00:00.000Z',
					lineNumber: 2,
					line: '{"ts":"2026-07-25T08:00:00.000Z","summary":"tool-failed: TypeError old failure"}',
				}),
			],
			now,
			sinceMinutes: 30,
		});

		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.line).toBe(1);
	});
});
