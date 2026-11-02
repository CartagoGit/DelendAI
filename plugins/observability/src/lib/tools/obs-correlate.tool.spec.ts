import { describe, expect, it } from 'vitest';

import type {
	IReadLocalCorrelateDeps,
	IReadonlyLocalLogLine,
} from '../correlate';
import type { IObsIssue } from '../errors/ierror-source';
import { buildObsCorrelateToolRegistration } from './obs-correlate.tool';
import { FakeServer, parseOk } from '../testing/tool-spec-server.helper';

const issues: readonly IObsIssue[] = [
	{
		id: 'issue-1',
		title: 'TypeError',
		project: 'web',
		level: 'error',
		lastSeen: '2026-07-25T11:59:00.000Z',
		eventCount: 2,
		context: 'Cannot read properties of undefined',
		url: 'https://sentry/issues/1',
	},
];

const logs: readonly IReadonlyLocalLogLine[] = [
	{
		ts: '2026-07-25T11:58:00.000Z',
		logFile: '.cache/delendai/results/logs/2026-07-25.jsonl',
		line: '{"ts":"2026-07-25T11:58:00.000Z","summary":"tool-failed: TypeError Cannot read properties of undefined"}',
		lineNumber: 7,
	},
];

const localDeps: IReadLocalCorrelateDeps = {
	listLocalLogs: async () => logs,
	listLocalMetrics: async () => [],
};

const build = () => {
	const registration = buildObsCorrelateToolRegistration({
		namespacePrefix: 'obs',
		issueReader: async () => issues,
		localDeps,
		now: () => new Date('2026-07-25T12:00:00.000Z'),
	});
	const server = new FakeServer();
	void registration.register(server.asServer);
	return server.tools;
};

describe('obs_correlate', () => {
	it('returns matches and a summary on the round-trip path', async () => {
		const tools = build();
		const out = parseOk(
			await tools.obs_obs_correlate!.handler({ sinceMinutes: 60 }),
		);
		expect(out.totalIssues).toBe(1);
		expect(out.totalLogs).toBe(1);
		expect(out.summary).toBe(
			'Correlated 1 match(es) across 1 remote issue(s), 1 local log line(s) in the last 60 minute(s).',
		);
		expect(out.matches).toEqual([
			{
				issueId: 'issue-1',
				logFile: '.cache/delendai/results/logs/2026-07-25.jsonl',
				line: 7,
				summary:
					'TypeError matched local log .cache/delendai/results/logs/2026-07-25.jsonl:7 — {"ts":"2026-07-25T11:58:00.000Z","summary":"tool-failed: TypeError Cannot read properties of undefined"}',
			},
		]);
	});
});
