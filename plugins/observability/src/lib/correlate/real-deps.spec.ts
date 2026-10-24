/**
 * `realReadLocalCorrelateDeps` — the actual filesystem-backed
 * implementation of `IReadLocalCorrelateDeps`. Every other spec in
 * this plugin exercises a hand-written fake of this interface; this
 * file is the only place the REAL `.jsonl` parsing, field-name
 * fallbacks and `since` filtering are proven against real files on
 * disk, under a throwaway workspace root (never the repo's own
 * `.cache`).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realReadLocalCorrelateDeps } from './real-deps';

const LOGS_DIR = '.cache/delendai/results/logs';
const ERRORS_DIR = '.cache/delendai/results/logs-errors';
const METRICS_DIR = '.cache/delendai/results/metrics';

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'obs-real-deps-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const writeJsonl = (relDir: string, name: string, lines: string[]): void => {
	const dirAbs = join(root, relDir);
	mkdirSync(dirAbs, { recursive: true });
	writeFileSync(join(dirAbs, name), `${lines.join('\n')}\n`);
};

describe('realReadLocalCorrelateDeps — listLocalLogs', () => {
	it('returns an empty list when the logs/errors directories do not exist at all', async () => {
		const deps = realReadLocalCorrelateDeps(root);
		expect(await deps.listLocalLogs()).toEqual([]);
	});

	it('reads a valid record, recognizing every accepted timestamp field name', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', [
			JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', msg: 'via ts' }),
		]);
		writeJsonl(ERRORS_DIR, 'b.jsonl', [
			JSON.stringify({
				timestamp: '2026-01-02T00:00:00.000Z',
				msg: 'via timestamp',
			}),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const lines = await deps.listLocalLogs();
		expect(lines).toHaveLength(2);
		expect(lines.map((l) => l.ts).sort()).toEqual([
			'2026-01-01T00:00:00.000Z',
			'2026-01-02T00:00:00.000Z',
		]);
	});

	it('reports logFile relative to the workspace root, and the 1-based line number', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', [
			JSON.stringify({ ts: '2026-01-01T00:00:00.000Z' }),
			JSON.stringify({ ts: '2026-01-01T00:00:01.000Z' }),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const lines = await deps.listLocalLogs();
		expect(lines[0]?.logFile).toBe(join(LOGS_DIR, 'a.jsonl'));
		expect(lines.map((l) => l.lineNumber)).toEqual([1, 2]);
	});

	it('skips blank lines and malformed JSON without failing the whole file', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', [
			'',
			'{not valid json',
			JSON.stringify({ ts: '2026-01-01T00:00:00.000Z' }),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const lines = await deps.listLocalLogs();
		expect(lines).toHaveLength(1);
	});

	it('drops a record with no recognizable timestamp field', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', [
			JSON.stringify({ msg: 'no ts here' }),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		expect(await deps.listLocalLogs()).toEqual([]);
	});

	it('drops a non-object JSON value (e.g. a bare string or number)', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', ['42', '"just a string"']);
		const deps = realReadLocalCorrelateDeps(root);
		expect(await deps.listLocalLogs()).toEqual([]);
	});

	it('filters to records at or after `since`, excluding earlier ones', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', [
			JSON.stringify({ ts: '2026-01-01T00:00:00.000Z' }),
			JSON.stringify({ ts: '2026-01-03T00:00:00.000Z' }),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const lines = await deps.listLocalLogs({
			since: '2026-01-02T00:00:00.000Z',
		});
		expect(lines).toHaveLength(1);
		expect(lines[0]?.ts).toBe('2026-01-03T00:00:00.000Z');
	});

	it('excludes every record when `since` itself is not a parseable date', async () => {
		writeJsonl(LOGS_DIR, 'a.jsonl', [
			JSON.stringify({ ts: '2026-01-01T00:00:00.000Z' }),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		expect(await deps.listLocalLogs({ since: 'not-a-real-date' })).toEqual(
			[],
		);
	});
});

describe('realReadLocalCorrelateDeps — listLocalMetrics', () => {
	it('returns an empty list when the metrics directory does not exist', async () => {
		const deps = realReadLocalCorrelateDeps(root);
		expect(await deps.listLocalMetrics()).toEqual([]);
	});

	it('reads name/value from the top-level fields', async () => {
		writeJsonl(METRICS_DIR, 'm.jsonl', [
			JSON.stringify({
				ts: '2026-01-01T00:00:00.000Z',
				name: 'latency',
				value: 12,
			}),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const metrics = await deps.listLocalMetrics();
		expect(metrics).toEqual([
			{ ts: '2026-01-01T00:00:00.000Z', name: 'latency', value: 12 },
		]);
	});

	it('falls back to meta.name / meta.value when the top-level fields are absent', async () => {
		writeJsonl(METRICS_DIR, 'm.jsonl', [
			JSON.stringify({
				ts: '2026-01-01T00:00:00.000Z',
				meta: { name: 'nested-metric', value: 'ok' },
			}),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const metrics = await deps.listLocalMetrics();
		expect(metrics).toEqual([
			{
				ts: '2026-01-01T00:00:00.000Z',
				name: 'nested-metric',
				value: 'ok',
			},
		]);
	});

	it('accepts `count`/`sum` as a value fallback and a `null` scalar value', async () => {
		writeJsonl(METRICS_DIR, 'm.jsonl', [
			JSON.stringify({
				ts: '2026-01-01T00:00:00.000Z',
				metric: 'errors',
				count: 0,
			}),
			JSON.stringify({
				ts: '2026-01-01T00:00:01.000Z',
				series: 'flag',
				sum: null,
			}),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		const metrics = await deps.listLocalMetrics();
		expect(metrics).toEqual([
			{ ts: '2026-01-01T00:00:00.000Z', name: 'errors', value: 0 },
			{ ts: '2026-01-01T00:00:01.000Z', name: 'flag', value: null },
		]);
	});

	it('drops a record missing a name or a value', async () => {
		writeJsonl(METRICS_DIR, 'm.jsonl', [
			JSON.stringify({
				ts: '2026-01-01T00:00:00.000Z',
				name: 'no-value',
			}),
			JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', value: 1 }),
		]);
		const deps = realReadLocalCorrelateDeps(root);
		expect(await deps.listLocalMetrics()).toEqual([]);
	});
});
