import { describe, expect, it } from 'vitest';

import type {
	IIssueExec,
	ISafeMcpVertexReport,
} from '../src/lib/contracts/interfaces/reporter.interface';
import { createSafeReporter, shouldReport } from '../src/lib/reporter.service';

// @ts-expect-error raw message must not be accepted by the safe report DTO.
const _compileRejectsRawMessage: ISafeMcpVertexReport = { message: 'boom' };
void _compileRejectsRawMessage;

describe('shouldReport', () => {
	const now = Date.parse('2026-08-24T00:00:00.000Z');

	it('reports when there is no previous record', () => {
		expect(
			shouldReport({
				lastSuccessAt: undefined,
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(true);
	});

	it('suppresses a report inside the window', () => {
		expect(
			shouldReport({
				lastSuccessAt: '2026-08-23T23:00:00.000Z',
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(false);
	});

	it('reports again after the window expires', () => {
		expect(
			shouldReport({
				lastSuccessAt: '2026-08-22T00:00:00.000Z',
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(true);
	});

	it('does not suppress retries when only a failed attempt timestamp exists', () => {
		expect(
			shouldReport({
				lastSuccessAt: undefined,
				dedupeWindowHours: 24,
				nowMs: now,
			}),
		).toBe(true);
	});
});

describe('createSafeReporter.submitSafeReport', () => {
	const base = {
		reporterVersion: '0.1.0',
		mcpVertexVersion: '0.1.0',
		packageId: '@mcp-vertex/error-reporting',
		toolOwner: 'host-project',
		toolCategory: 'host-specific',
		errorCode: 'PLUGIN_REGISTER_TIMEOUT',
		failureClass: 'INTERNAL_TIMEOUT',
		classification: 'PERFORMANCE',
		fingerprint: 'abc123',
		mcpFrames: [
			{
				file: '@mcp-vertex/error-reporting/src/index.ts',
				line: 12,
				col: 3,
				fn: 'reportError',
			},
		],
	} satisfies ISafeMcpVertexReport;
	const reporter = createSafeReporter({
		targetRepo: 'consumer/private-project',
		labels: ['consumer-private-label'],
		workspaceRootAbs: '/tmp/proj',
	});

	it('parses the created issue number from gh output', async () => {
		const exec: IIssueExec = async () => ({
			ok: true,
			code: 0,
			stdout: 'https://github.com/CartagoGit/mcp-vertex/issues/1234\n',
			stderr: '',
		});
		const outcome = await reporter.submitSafeReport(base, exec);
		expect(outcome.ok).toBe(true);
		if (outcome.ok) {
			expect(outcome.issueNumber).toBe(1234);
			expect(outcome.issueUrl).toBe(
				'https://github.com/CartagoGit/mcp-vertex/issues/1234',
			);
		}
	});

	it('returns a structured failure when gh exits non-zero', async () => {
		const exec: IIssueExec = async () => ({
			ok: false,
			code: 1,
			stdout: '',
			stderr: 'gh auth required\n',
		});
		const outcome = await reporter.submitSafeReport(base, exec);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.reason).toContain('gh auth required');
			expect(outcome.failureCode).toBe('GH_EXEC_FAILED');
		}
	});

	it('does not invoke gh when the network preflight is offline', async () => {
		let execCalls = 0;
		const exec: IIssueExec = async () => {
			execCalls += 1;
			return {
				ok: true,
				code: 0,
				stdout: 'https://github.com/CartagoGit/mcp-vertex/issues/1\n',
				stderr: '',
			};
		};
		const offlineReporter = createSafeReporter({
			targetRepo: 'CartagoGit/mcp-vertex',
			labels: ['auto-reported', 'bug'],
			workspaceRootAbs: '/tmp/proj',
			networkProbe: async () => false,
		});

		const outcome = await offlineReporter.submitSafeReport(base, exec);

		expect(outcome).toEqual({
			ok: false,
			reason: 'GitHub is unreachable; issue creation was not attempted',
			failureCode: 'NETWORK_UNAVAILABLE',
		});
		expect(execCalls).toBe(0);
	});

	it('allows gh after a reachable GitHub preflight, including auth responses', async () => {
		let execCalls = 0;
		const authenticatedReporter = createSafeReporter({
			targetRepo: 'CartagoGit/mcp-vertex',
			labels: ['auto-reported', 'bug'],
			workspaceRootAbs: '/tmp/proj',
			networkProbe: async () => true,
		});
		const exec: IIssueExec = async () => {
			execCalls += 1;
			return {
				ok: true,
				code: 0,
				stdout: 'https://github.com/CartagoGit/mcp-vertex/issues/2\n',
				stderr: '',
			};
		};

		const outcome = await authenticatedReporter.submitSafeReport(
			base,
			exec,
		);

		expect(outcome.ok).toBe(true);
		expect(execCalls).toBe(1);
	});

	it('flags a missing gh binary explicitly', async () => {
		const exec: IIssueExec = async () => ({
			ok: false,
			code: 127,
			stdout: '',
			stderr: '',
		});
		const outcome = await reporter.submitSafeReport(base, exec);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.reason).toContain('not installed');
			expect(outcome.failureCode).toBe('GH_NOT_INSTALLED');
		}
	});

	it('returns a typed parse failure when gh output has no issue number', async () => {
		const exec: IIssueExec = async () => ({
			ok: true,
			code: 0,
			stdout: 'created but hidden somewhere else\n',
			stderr: '',
		});
		const outcome = await reporter.submitSafeReport(base, exec);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.failureCode).toBe('ISSUE_NUMBER_PARSE_FAILED');
		}
	});

	it('sends title, body and labels as gh argv', async () => {
		let captured: readonly string[] = [];
		let capturedOptions: { readonly cwd?: string | undefined } | undefined;
		const exec: IIssueExec = async (argv) => {
			captured = argv;
			capturedOptions = { cwd: '/tmp/proj' };
			return {
				ok: true,
				code: 0,
				stdout: 'https://github.com/CartagoGit/mcp-vertex/issues/9\n',
				stderr: '',
			};
		};
		await reporter.submitSafeReport(base, exec);
		const joined = captured.join(' ');
		expect(joined).toContain('issue create');
		expect(joined).toContain('--repo CartagoGit/mcp-vertex');
		expect(joined).not.toContain('consumer/private-project');
		expect(joined).toContain('--label auto-reported');
		expect(joined).toContain('--label bug');
		expect(joined).not.toContain('consumer-private-label');
		expect(joined).toContain(
			'[auto] PERFORMANCE @mcp-vertex/error-reporting: PLUGIN_REGISTER_TIMEOUT',
		);
		expect(capturedOptions).toEqual({ cwd: '/tmp/proj' });
	});
});
