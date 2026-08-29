/**
 * `realReadTracesDeps` / `realReadReleaseHealthDeps` — the real
 * filesystem-backed adapters. Every other trace/release-health spec
 * in this plugin drives a hand-written fake of these interfaces; this
 * file is the only place the actual field-name fallbacks, the
 * isError/crashed precedence rules, and the `since`-free filters
 * (`service`/`version`/`limit`) are proven against real `.jsonl`
 * files under a throwaway workspace root.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realReadReleaseHealthDeps, realReadTracesDeps } from './real-deps';

const LOGS_DIR = '.cache/mcp-vertex/results/logs';

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'obs-traces-real-deps-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const writeJsonl = (name: string, lines: unknown[]): void => {
	const dirAbs = join(root, LOGS_DIR);
	mkdirSync(dirAbs, { recursive: true });
	writeFileSync(
		join(dirAbs, name),
		`${lines.map((l) => JSON.stringify(l)).join('\n')}\n`,
	);
};

describe('realReadTracesDeps', () => {
	it('returns an empty list when the logs directory does not exist', async () => {
		const deps = realReadTracesDeps(root);
		expect(await deps.listTraceRecords()).toEqual([]);
	});

	it('drops a record with no recognizable traceId, even if everything else is present', async () => {
		writeJsonl('a.jsonl', [
			{ service: 'core', ts: '2026-01-01T00:00:00Z' },
		]);
		const deps = realReadTracesDeps(root);
		expect(await deps.listTraceRecords()).toEqual([]);
	});

	it('defaults service to "unknown" and ts to the epoch when absent', async () => {
		writeJsonl('a.jsonl', [{ traceId: 't1' }]);
		const deps = realReadTracesDeps(root);
		const [record] = await deps.listTraceRecords();
		expect(record).toMatchObject({
			service: 'unknown',
			traceId: 't1',
			ts: new Date(0).toISOString(),
		});
	});

	it('an explicit isError flag wins over outcome and errorMessage', async () => {
		writeJsonl('a.jsonl', [
			{
				traceId: 't1',
				isError: false,
				outcome: 'failed',
				errorMessage: 'boom',
			},
		]);
		const deps = realReadTracesDeps(root);
		const [record] = await deps.listTraceRecords();
		expect(record?.isError).toBe(false);
	});

	it('falls back to outcome when no explicit isError flag is present', async () => {
		writeJsonl('a.jsonl', [
			{ traceId: 't1', outcome: 'cancelled' },
			{ traceId: 't2', outcome: 'ok' },
		]);
		const deps = realReadTracesDeps(root);
		const records = await deps.listTraceRecords();
		expect(records.find((r) => r.traceId === 't1')?.isError).toBe(true);
		expect(records.find((r) => r.traceId === 't2')?.isError).toBe(false);
	});

	it('falls back to errorMessage presence when neither isError nor outcome is present', async () => {
		writeJsonl('a.jsonl', [
			{ traceId: 't1', errorMessage: 'threw' },
			{ traceId: 't2' },
		]);
		const deps = realReadTracesDeps(root);
		const records = await deps.listTraceRecords();
		expect(records.find((r) => r.traceId === 't1')?.isError).toBe(true);
		expect(records.find((r) => r.traceId === 't2')?.isError).toBe(false);
	});

	it('filters by service when a filter.service is given', async () => {
		writeJsonl('a.jsonl', [
			{ traceId: 't1', service: 'core' },
			{ traceId: 't2', service: 'web' },
		]);
		const deps = realReadTracesDeps(root);
		const records = await deps.listTraceRecords({ service: 'web' });
		expect(records.map((r) => r.traceId)).toEqual(['t2']);
	});

	it('caps the result to the most recent `limit` records', async () => {
		writeJsonl('a.jsonl', [
			{ traceId: 't1' },
			{ traceId: 't2' },
			{ traceId: 't3' },
		]);
		const deps = realReadTracesDeps(root);
		const records = await deps.listTraceRecords({ limit: 2 });
		expect(records.map((r) => r.traceId)).toEqual(['t2', 't3']);
	});

	it('reads traceId/service through the nested meta.result.structuredContent fallback', async () => {
		writeJsonl('a.jsonl', [
			{
				meta: {
					result: {
						structuredContent: {
							traceId: 'nested-t',
							service: 'nested-s',
						},
					},
				},
			},
		]);
		const deps = realReadTracesDeps(root);
		const [record] = await deps.listTraceRecords();
		expect(record).toMatchObject({
			traceId: 'nested-t',
			service: 'nested-s',
		});
	});
});

describe('realReadReleaseHealthDeps', () => {
	it('returns an empty list when the logs directory does not exist', async () => {
		const deps = realReadReleaseHealthDeps(root);
		expect(await deps.listReleaseHealthRecords()).toEqual([]);
	});

	it('drops a record missing version or sessionId', async () => {
		writeJsonl('a.jsonl', [
			{ version: '1.0.0' }, // no sessionId
			{ sessionId: 's1' }, // no version
		]);
		const deps = realReadReleaseHealthDeps(root);
		expect(await deps.listReleaseHealthRecords()).toEqual([]);
	});

	it('an explicit crashed flag wins over outcome and error.message', async () => {
		writeJsonl('a.jsonl', [
			{
				version: '1.0.0',
				sessionId: 's1',
				crashed: false,
				outcome: 'fatal',
			},
		]);
		const deps = realReadReleaseHealthDeps(root);
		const [record] = await deps.listReleaseHealthRecords();
		expect(record?.crashed).toBe(false);
	});

	it('falls back to outcome, then to error.message presence, for crashed', async () => {
		writeJsonl('a.jsonl', [
			{ version: '1.0.0', sessionId: 's1', outcome: 'crashed' },
			{
				version: '1.0.0',
				sessionId: 's2',
				error: { message: 'native crash' },
			},
			{ version: '1.0.0', sessionId: 's3' },
		]);
		const deps = realReadReleaseHealthDeps(root);
		const records = await deps.listReleaseHealthRecords();
		expect(records.find((r) => r.sessionId === 's1')?.crashed).toBe(true);
		expect(records.find((r) => r.sessionId === 's2')?.crashed).toBe(true);
		expect(records.find((r) => r.sessionId === 's3')?.crashed).toBe(false);
	});

	it('filters by version when filter.version is given', async () => {
		writeJsonl('a.jsonl', [
			{ version: '1.0.0', sessionId: 's1' },
			{ version: '2.0.0', sessionId: 's2' },
		]);
		const deps = realReadReleaseHealthDeps(root);
		const records = await deps.listReleaseHealthRecords({
			version: '2.0.0',
		});
		expect(records.map((r) => r.sessionId)).toEqual(['s2']);
	});

	it('omits `ts` entirely (not null) when no timestamp field is present', async () => {
		writeJsonl('a.jsonl', [{ version: '1.0.0', sessionId: 's1' }]);
		const deps = realReadReleaseHealthDeps(root);
		const [record] = await deps.listReleaseHealthRecords();
		expect(record).not.toHaveProperty('ts');
	});
});
