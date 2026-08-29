import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@mcp-vertex/core/public';

import plugin from '../../src/index';
import type { IInvocationRecordTelemetry } from '../../src/lib/contracts/invocation-record.interface';
import { drainLiveBuffers } from '../../src/lib/record-buffer';
import { buildInvocationRecord } from '../../src/lib/services/invocation-recorder.service';
import { regenerateUsageSummary } from '../../src/lib/services/usage-rollup.service';
import type { IModelDescriptor, IUsageTokens } from '../../src/lib/types';

const readLog = (path: string): IInvocationRecordTelemetry[] =>
	readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as IInvocationRecordTelemetry);

describe('invocation telemetry', () => {
	let dir = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-telemetry-'));
	});

	afterEach(async () => {
		await drainLiveBuffers();
		rmSync(dir, { recursive: true, force: true });
	});

	const makeCtx = (): IMcpPluginContext =>
		({
			workspace: { root: dir, resolve: (p: string) => join(dir, p) },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: 'usage-tracking',
			pluginDocsDir: 'docs/usage-tracking',
			namespacePrefix: 'mcp-vertex_usage-tracking',
			hostIdentity: { host: 'GitHub Copilot Chat' },
			peerPlugins: {
				list: () => ['orchestrator-runner', 'usage-tracking'],
				has: (name: string) =>
					['orchestrator-runner', 'usage-tracking'].includes(name),
			},
			options: { maxBatch: 2, maxDelayMs: 20, summaryIntervalMs: 60_000 },
			args: {},
		}) as unknown as IMcpPluginContext;

	const noopCost = (
		_model: IModelDescriptor | null,
		_usage: IUsageTokens | null,
	): number | null => 1.25;

	it('builds a redacted detailed invocation record with request and correlation metadata', () => {
		const record = buildInvocationRecord({
			toolName: 'mcp-vertex_orchestrator-runner_invoke',
			corePrefix: 'mcp-vertex',
			peerPrefixes: ['orchestrator-runner', 'usage-tracking'],
			agent: {
				id: 'GitHub Copilot Chat',
				kind: 'copilot',
				extension: 'vscode-copilot',
			},
			host: 'GitHub Copilot Chat',
			sessionId: 's-telemetry',
			args: {
				requestType: 'query',
				correlationId: 'corr-123',
				iteration: 2,
			},
			result: {
				structuredContent: {
					usage: {
						inputTokens: 120,
						outputTokens: 30,
						totalTokens: 150,
					},
					model: {
						provider: 'openai',
						modelId: 'gpt-5.4',
						kind: 'api',
					},
					fallbackFrom: 'gpt-4.1',
				},
			},
			startedAt: 1_000,
			endedAt: 1_180,
			responseBytes: 640,
			costOf: noopCost,
		});

		expect(record.host).toBe('GitHub Copilot Chat');
		expect(record.requestType).toBe('query');
		expect(record.iteration).toBe(2);
		expect(record.retry).toBe(true);
		expect(record.correlation?.id).toBe('corr-123');
		expect(record.outcome).toBe('fallback');
		expect(record.latencyMs).toBe(180);
		expect(record.tokenCount).toBe(150);
		expect(record.dimensions).toMatchObject({
			plugin: 'orchestrator-runner',
			tool: 'invoke',
			requestType: 'query',
			outcome: 'fallback',
			correlation: 'corr-123',
			iteration: 2,
			latencyMs: 180,
			tokenCount: 150,
		});
	});

	it('persists enriched telemetry and rollups without breaking append-only logging', async () => {
		const reg = await plugin.register(makeCtx());
		reg.onToolStart?.('mcp-vertex_orchestrator-runner_invoke', {});
		reg.onToolCall?.(
			'mcp-vertex_orchestrator-runner_invoke',
			{
				sessionId: 's_rollup',
				requestType: 'execution',
				requestId: 'req-22',
				attempt: 3,
			},
			{
				structuredContent: {
					usage: {
						inputTokens: 80,
						outputTokens: 20,
						totalTokens: 100,
					},
					model: {
						provider: 'openai',
						modelId: 'gpt-5.4',
						kind: 'api',
					},
				},
			},
			undefined,
		);
		reg.onToolCall?.(
			'mcp-vertex_orchestrator-runner_invoke',
			{
				sessionId: 's_rollup',
				requestType: 'query',
				correlationId: 'corr-bad',
			},
			{
				structuredContent: {
					ok: false,
					issues: [{ code: 'invalid_type' }],
				},
			},
			new Error('schema mismatch token sk-live-1234567890'),
		);
		await drainLiveBuffers();

		const invocationsPath = join(
			dir,
			'usage-tracking',
			'invocations.jsonl',
		);
		const summaryPath = join(dir, 'usage-tracking', 'usage-summary.json');
		const rows = readLog(invocationsPath);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.requestType).toBe('execution');
		expect(rows[0]?.iteration).toBe(3);
		expect(rows[0]?.correlation?.id).toBe('req-22');
		expect(rows[1]?.errorTelemetry?.classification).toBe(
			'schema-incongruence',
		);
		expect(rows[1]?.error?.message.includes('sk-live')).toBe(false);

		const summary = await regenerateUsageSummary(
			invocationsPath,
			summaryPath,
			7,
			Date.parse('2026-08-29T12:00:00.000Z'),
		);
		expect(summary.totals.calls).toBe(2);
		expect(summary.invocationTelemetry.totals.calls).toBe(2);
		expect(summary.invocationTelemetry.totals.failedCalls).toBe(1);
		expect(summary.invocationTelemetry.totals.retries).toBe(1);
		expect(summary.invocationTelemetry.totals.totalTokens).toBe(100);
		expect(summary.invocationTelemetry.byRequestType[0]?.key).toBe(
			'execution',
		);
		expect(summary.invocationTelemetry.byTool[0]?.key).toBe(
			'orchestrator-runner/invoke',
		);
		expect(summary.invocationTelemetry.byError[0]?.key).toBe(
			'schema-incongruence',
		);
		expect(summary.invocationTelemetry.issues[0]?.correlationId).toBe(
			'corr-bad',
		);
	});

	it('rebuilds telemetry rollups from durable rows with explicit dimensions only when present', async () => {
		const invocationsPath = join(
			dir,
			'usage-tracking',
			'invocations.jsonl',
		);
		const summaryPath = join(dir, 'usage-tracking', 'usage-summary.json');
		const rows: IInvocationRecordTelemetry[] = [
			{
				ts: '2026-08-29T08:00:00.000Z',
				sessionId: 's_a',
				host: 'Claude Code',
				agent: {
					id: 'Claude Code',
					kind: 'claude-code',
					extension: 'claude-code',
				},
				plugin: 'docs',
				tool: 'docs_read',
				model: null,
				usage: null,
				costUsd: null,
				tokensSaved: 0,
				durationMs: 25,
				latencyMs: 25,
				outcome: 'success',
				fallbackFrom: null,
				error: null,
				autoBypassed: false,
				requestType: 'query',
				iteration: null,
				retry: false,
				correlation: null,
				tokenCount: null,
				successful: true,
				failure: false,
				errorTelemetry: null,
				dimensions: {
					plugin: 'docs',
					tool: 'docs_read',
					model: null,
					agent: 'claude-code',
					requestType: 'query',
					outcome: 'success',
					error: null,
					correlation: null,
					iteration: null,
					latencyMs: 25,
					tokenCount: null,
				},
			},
		];
		mkdirSync(join(dir, 'usage-tracking'), { recursive: true });
		writeFileSync(
			invocationsPath,
			`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
			'utf8',
		);

		const summary = await regenerateUsageSummary(
			invocationsPath,
			summaryPath,
			7,
			Date.parse('2026-08-29T12:00:00.000Z'),
		);
		expect(summary.invocationTelemetry.totals.withCorrelation).toBe(0);
		expect(summary.invocationTelemetry.byRequestType[0]?.key).toBe('query');
		expect(summary.invocationTelemetry.byOutcome[0]?.key).toBe('success');
	});
});
