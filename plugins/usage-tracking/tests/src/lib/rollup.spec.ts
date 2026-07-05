/**
 * rollup.spec.ts — groupby folds + durable summary write.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	bucketBy,
	buildSummary,
	computeTotals,
	readInvocations,
	regenerateSummary,
	withinWindow,
} from '../../../src/lib/rollup';
import type { IInvocationRecord } from '../../../src/lib/types';

const rec = (
	over: Partial<IInvocationRecord> & { ts: string },
): IInvocationRecord => ({
	sessionId: 's',
	agent: { id: 'copilot-1', kind: 'copilot', extension: 'vscode-copilot' },
	plugin: 'proposals',
	tool: 'auto_work',
	model: null,
	usage: null,
	costUsd: null,
	durationMs: null,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
	...over,
});

describe('rollup', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-roll-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('reads NDJSON and skips a torn tail line', async () => {
		const path = join(dir, 'invocations.jsonl');
		writeFileSync(
			path,
			`${JSON.stringify(rec({ ts: '2026-06-25T00:00:00.000Z' }))}\n{"partial":`,
			'utf8',
		);
		const records = await readInvocations(path);
		expect(records).toHaveLength(1);
	});

	it('returns [] for a missing log', async () => {
		expect(await readInvocations(join(dir, 'nope.jsonl'))).toEqual([]);
	});

	it('buckets by every axis and totals usage/cost/errors', () => {
		const now = Date.parse('2026-06-25T12:00:00.000Z');
		const records = [
			rec({
				ts: '2026-06-25T11:00:00.000Z',
				plugin: 'proposals',
				model: {
					provider: 'copilot-m3',
					modelId: 'm3',
					kind: 'subscription',
				},
				usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
				costUsd: 1,
			}),
			rec({
				ts: '2026-06-25T11:30:00.000Z',
				plugin: 'docs',
				outcome: 'error',
				error: { code: 'x', message: 'y' },
				costUsd: 2,
			}),
		];
		const totals = computeTotals(records);
		expect(totals.calls).toBe(2);
		expect(totals.costUsd).toBe(3);
		expect(totals.errors).toBe(1);
		expect(totals.totalTokens).toBe(120);

		const byPlugin = bucketBy(records, 'plugin', 'costUsd');
		expect(byPlugin[0]?.key).toBe('docs');
		expect(byPlugin[0]?.costUsd).toBe(2);

		const byProvider = bucketBy(records, 'provider', 'calls');
		const providers = byProvider.map((b) => b.key).sort();
		expect(providers).toEqual(['copilot-m3', 'unknown']);

		const summary = buildSummary(records, 7, now);
		expect(summary.totals.calls).toBe(2);
		expect(summary.byExtension[0]?.key).toBe('vscode-copilot');
	});

	it('windows out records older than windowDays', () => {
		const now = Date.parse('2026-06-25T00:00:00.000Z');
		const records = [
			rec({ ts: '2026-06-24T00:00:00.000Z' }), // in window
			rec({ ts: '2026-05-01T00:00:00.000Z' }), // out of window
		];
		expect(withinWindow(records, 7, now)).toHaveLength(1);
	});

	it('regenerates and persists usage-summary.json durably', async () => {
		const log = join(dir, 'invocations.jsonl');
		const summaryPath = join(dir, 'usage-summary.json');
		writeFileSync(
			log,
			`${JSON.stringify(rec({ ts: new Date().toISOString(), costUsd: 5 }))}\n`,
			'utf8',
		);
		const summary = await regenerateSummary(log, summaryPath, 7);
		expect(summary.totals.calls).toBe(1);
		const onDisk = JSON.parse(readFileSync(summaryPath, 'utf8'));
		expect(onDisk.totals.costUsd).toBe(5);
	});
});
