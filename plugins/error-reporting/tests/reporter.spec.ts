import { describe, expect, it } from 'vitest';

import { shouldReport, submitIssue } from '../src/lib/reporter';
import type { IIssueExec } from '../src/lib/reporter';

describe('shouldReport', () => {
	const now = Date.parse('2026-08-24T00:00:00.000Z');

	it('reports when there is no previous record', () => {
		expect(
			shouldReport({
				lastReportedAt: undefined,
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(true);
	});

	it('suppresses a report inside the window', () => {
		expect(
			shouldReport({
				lastReportedAt: '2026-08-23T23:00:00.000Z',
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(false);
	});

	it('reports again after the window expires', () => {
		expect(
			shouldReport({
				lastReportedAt: '2026-08-22T00:00:00.000Z',
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(true);
	});
});

describe('submitIssue', () => {
	const base = {
		targetRepo: 'CartagoGit/mcp-vertex',
		labels: ['auto-reported', 'bug'],
		workspaceRootAbs: '/tmp/proj',
		toolName: 'tool_x',
		error: new Error('boom'),
		signature: 'tool_x::boom',
		argsJson: '{}',
		namespacePrefix: 'mcp-vertex',
	};

	it('parses the created issue number from gh output', async () => {
		const exec: IIssueExec = async () => ({
			ok: true,
			code: 0,
			stdout: 'https://github.com/CartagoGit/mcp-vertex/issues/1234\n',
			stderr: '',
		});
		const outcome = await submitIssue(base, exec);
		expect(outcome.ok).toBe(true);
		expect(outcome.issueNumber).toBe(1234);
		expect(outcome.issueUrl).toBe(
			'https://github.com/CartagoGit/mcp-vertex/issues/1234',
		);
	});

	it('returns a structured failure when gh exits non-zero', async () => {
		const exec: IIssueExec = async () => ({
			ok: false,
			code: 1,
			stdout: '',
			stderr: 'gh auth required\n',
		});
		const outcome = await submitIssue(base, exec);
		expect(outcome.ok).toBe(false);
		expect(outcome.reason).toContain('gh auth required');
	});

	it('flags a missing gh binary explicitly', async () => {
		const exec: IIssueExec = async () => ({
			ok: false,
			code: 127,
			stdout: '',
			stderr: '',
		});
		const outcome = await submitIssue(base, exec);
		expect(outcome.ok).toBe(false);
		expect(outcome.reason).toContain('not installed');
	});

	it('sends title, body and labels as gh argv', async () => {
		let captured: readonly string[] = [];
		const exec: IIssueExec = async (argv) => {
			captured = argv;
			return {
				ok: true,
				code: 0,
				stdout: 'https://github.com/CartagoGit/mcp-vertex/issues/9\n',
				stderr: '',
			};
		};
		await submitIssue(base, exec);
		const joined = captured.join(' ');
		expect(joined).toContain('issue create');
		expect(joined).toContain('--repo CartagoGit/mcp-vertex');
		expect(joined).toContain('--label auto-reported');
		expect(joined).toContain('--label bug');
		expect(joined).toContain('[auto] tool_x: boom');
	});
});
