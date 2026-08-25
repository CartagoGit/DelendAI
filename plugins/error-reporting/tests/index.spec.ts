import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IToolIdentityRegistry } from '@mcp-vertex/core/public';
import type { ISafeReporter } from '../src/lib/contracts/interfaces/reporter.interface';
import { createReportStore } from '../src/lib/report-store.service';
import {
	registerInternalPath,
	resetInternalPathRegistry,
} from '../src/lib/signature.helper';
import {
	buildObservedFailureHandler,
	buildReportErrorHandler,
} from '../src/index';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-index-'));
	tmpDirs.push(dir);
	return dir;
};

const emptyToolRegistry: IToolIdentityRegistry = {
	get: () => undefined,
	list: () => new Map(),
};

const llmToolRegistry: IToolIdentityRegistry = {
	get: (toolName) =>
		toolName === 'mcp-vertex_orchestrator-runner_invoke'
			? {
					packageName: '@mcp-vertex/orchestrator-runner',
					owner: 'mcp-vertex',
					publicToolName: 'invoke',
					category: 'orchestration',
				}
			: undefined,
	list: () =>
		new Map([
			[
				'mcp-vertex_orchestrator-runner_invoke',
				{
					packageName: '@mcp-vertex/orchestrator-runner',
					owner: 'mcp-vertex',
					publicToolName: 'invoke',
					category: 'orchestration',
				},
			],
		]),
};

afterEach(async () => {
	resetInternalPathRegistry();
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const internalError = (): Error => {
	registerInternalPath('/workspace');
	const error = new Error('runtime secret 123 should never persist');
	error.stack = [
		'Error: runtime secret 123 should never persist',
		'    at report (/workspace/plugins/error-reporting/src/index.ts:10:2)',
	].join('\n');
	return error;
};

describe('buildReportErrorHandler', () => {
	it('records a failed attempt without creating a synthetic success timestamp, then retries later', async () => {
		const store = createReportStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					reason: 'offline',
					failureCode: 'GH_EXEC_FAILED',
				})
				.mockResolvedValueOnce({
					ok: true,
					reason: 'created',
					issueNumber: 77,
				}),
		};
		const clock = {
			nowMs: vi
				.fn<() => number>()
				.mockReturnValueOnce(Date.parse('2026-08-24T10:00:00.000Z'))
				.mockReturnValueOnce(Date.parse('2026-08-24T10:02:00.000Z'))
				.mockReturnValue(Date.parse('2026-08-24T10:02:00.000Z')),
			random: () => 0,
		};
		const reportError = buildReportErrorHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 3,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			store,
			reporter,
			clock,
			toolRegistry: emptyToolRegistry,
		});

		await reportError('quality_run_quality', internalError());
		const failed = await store.all();
		expect(failed[0]?.classification).toBe('BUG');
		expect(failed[0]?.lastSuccessAt).toBeUndefined();
		expect(failed[0]?.lastFailureCode).toBe('GH_EXEC_FAILED');

		await reportError('quality_run_quality', internalError());
		const record = await store.all();
		expect(record[0]?.issueNumber).toBe(77);
		expect(record[0]?.lastSuccessAt).toBe('2026-08-24T10:02:00.000Z');
		expect(reporter.submitSafeReport).toHaveBeenCalledTimes(2);
	});

	it('does not call gh again once the fingerprint already has an issue number', async () => {
		const store = createReportStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: vi.fn().mockResolvedValue({
				ok: true,
				reason: 'created',
				issueNumber: 88,
			}),
		};
		const clock = {
			nowMs: () => Date.parse('2026-08-24T10:00:00.000Z'),
			random: () => 0,
		};
		const reportError = buildReportErrorHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 3,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			store,
			reporter,
			clock,
			toolRegistry: emptyToolRegistry,
		});

		await reportError('quality_run_quality', internalError());
		await reportError('quality_run_quality', internalError());

		const record = await store.all();
		expect(record[0]?.attemptCount).toBe(2);
		expect(record[0]?.classification).toBe('BUG');
		expect(record[0]?.issueNumber).toBe(88);
		expect(reporter.submitSafeReport).toHaveBeenCalledTimes(1);
	});

	it('reports an llm-format failure surfaced through tool result envelopes', async () => {
		const store = createReportStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: vi.fn().mockResolvedValue({
				ok: true,
				reason: 'created',
				issueNumber: 101,
			}),
		};
		const observe = buildObservedFailureHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 3,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			store,
			reporter,
			clock: {
				nowMs: () => Date.parse('2026-08-24T10:00:00.000Z'),
				random: () => 0,
			},
			toolRegistry: llmToolRegistry,
		});

		await observe(
			'mcp-vertex_orchestrator-runner_invoke',
			{
				structuredContent: {
					error: {
						code: 'LLM_FORMAT',
						reason: 'provider rejected invalid request body after schema validation failed',
					},
				},
			},
			undefined,
		);

		expect(reporter.submitSafeReport).toHaveBeenCalledTimes(1);
		const record = await store.all();
		expect(record[0]?.issueNumber).toBe(101);
	});

	it('does not report host tools that spoof an internal llm suffix', async () => {
		const store = createReportStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: vi.fn().mockResolvedValue({
				ok: true,
				reason: 'created',
				issueNumber: 303,
			}),
		};
		const observe = buildObservedFailureHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 3,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			store,
			reporter,
			clock: {
				nowMs: () => Date.parse('2026-08-24T10:00:00.000Z'),
				random: () => 0,
			},
			toolRegistry: {
				get: (toolName) =>
					toolName ===
					'acme_private_billing_orchestrator-runner_invoke'
						? {
								packageName: '/workspace/acme/tools.ts',
								owner: 'host-project',
								category: 'host-specific',
							}
						: undefined,
			},
		});

		await observe(
			'acme_private_billing_orchestrator-runner_invoke',
			{
				structuredContent: {
					error: {
						code: 'LLM_FORMAT',
						reason: 'provider rejected invalid request body after schema validation failed',
					},
				},
			},
			undefined,
		);

		expect(reporter.submitSafeReport).not.toHaveBeenCalled();
		expect(await store.all()).toEqual([]);
	});

	it('does not report external provider failures surfaced through tool result envelopes', async () => {
		const store = createReportStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: vi.fn().mockResolvedValue({
				ok: true,
				reason: 'created',
				issueNumber: 202,
			}),
		};
		const observe = buildObservedFailureHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 3,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			store,
			reporter,
			clock: {
				nowMs: () => Date.parse('2026-08-24T10:00:00.000Z'),
				random: () => 0,
			},
			toolRegistry: emptyToolRegistry,
		});

		await observe(
			'mcp-vertex_orchestrator-runner_invoke',
			{
				structuredContent: {
					error: {
						reason: 'api responded 429: rate limit exceeded',
					},
				},
			},
			undefined,
		);

		expect(reporter.submitSafeReport).not.toHaveBeenCalled();
		expect(await store.all()).toEqual([]);
	});
});
