/**
 * Tool results are measured (f00645 S1): `usage_report` ranks tools by
 * the total and by the largest result they returned.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { rankToolResultSizes } from '../../../src/lib/result-size-ranking.helper';
import { SessionHygieneMonitor } from '../../../src/lib/session-hygiene';
import { buildUsageTrackingToolRegistrations } from '../../../src/lib/tools';
import type { IInvocationRecord } from '../../../src/lib/types';

const rec = (over: Partial<IInvocationRecord>): IInvocationRecord => ({
	ts: new Date().toISOString(),
	sessionId: 'session-1',
	agent: { id: 'agent-1', kind: 'copilot', extension: 'vscode-copilot' },
	plugin: 'proposals',
	tool: 'review_queue',
	model: null,
	usage: null,
	costUsd: null,
	tokensSaved: 0,
	durationMs: 10,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
	...over,
});

// Many small answers outweigh one big one in total, not in size.
const RECORDS = [
	rec({ tool: 'review_queue', responseBytes: 600_000 }),
	rec({ tool: 'status', responseBytes: 300_000 }),
	rec({ tool: 'status', responseBytes: 400_000 }),
	rec({ tool: 'status', responseBytes: 200_000 }),
	rec({ plugin: 'memory', tool: 'recall', responseBytes: 1_000 }),
	rec({ plugin: 'memory', tool: 'unmeasured' }),
];

describe('rankToolResultSizes', () => {
	it('ranks tools by total and by largest result, skipping unmeasured calls', () => {
		const ranking = rankToolResultSizes(RECORDS, 10);
		expect(ranking.byTotal.map((entry) => entry.tool)).toEqual([
			'status',
			'review_queue',
			'recall',
		]);
		expect(ranking.byLargest.map((entry) => entry.tool)).toEqual([
			'review_queue',
			'status',
			'recall',
		]);
		expect(ranking.byTotal[0]).toEqual({
			plugin: 'proposals',
			tool: 'status',
			calls: 3,
			totalBytes: 900_000,
			largestBytes: 400_000,
		});
	});

	it('lists at most `limit` tools', () => {
		expect(rankToolResultSizes(RECORDS, 1).byTotal).toHaveLength(1);
	});
});

describe('usage_report result sizes', () => {
	let dir = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-result-sizes-'));
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const report = async (
		args: Record<string, unknown>,
	): Promise<Record<string, unknown>> => {
		const invocationsPath = join(dir, 'invocations.jsonl');
		writeFileSync(
			invocationsPath,
			`${RECORDS.map((record) => JSON.stringify(record)).join('\n')}\n`,
		);
		const [registration] = buildUsageTrackingToolRegistrations({
			namespacePrefix: 'delendai_usage-tracking',
			invocationsPath,
			summaryPath: join(dir, 'usage-summary.json'),
			hostLifecyclePath: join(dir, 'host-lifecycle.jsonl'),
			sessionHygiene: new SessionHygieneMonitor({
				maxSessionAgeMs: 60 * 60 * 1000,
				maxIdleGapMs: 30 * 60 * 1000,
				maxMcpOutputTokens: 8_000,
			}),
		}) as [IToolRegistration];
		let handler: ((a: unknown) => unknown) | undefined;
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					handler = tool.handler;
				},
			}),
		);
		const result = (await handler!(args)) as {
			content: { text: string }[];
		};
		return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
	};

	it('returns the rankings, and drops them from a compact report', async () => {
		const normal = await report({});
		expect(normal.resultSizes).toMatchObject({
			byTotal: [{ tool: 'status' }, { tool: 'review_queue' }, {}],
			byLargest: [{ tool: 'review_queue' }, { tool: 'status' }, {}],
		});
		const compact = await report({ detail: 'compact' });
		expect(compact.resultSizes).toEqual({ byTotal: [], byLargest: [] });
	});
});
