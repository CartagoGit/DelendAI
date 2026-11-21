import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	honestEntry,
	honestRewriteFile,
} from '@delendai/proposals/lib/logging/log-honest';

describe('log-honest (a00072 S5.c)', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'log-honest-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('forces outcome=error when meta.isError is true', () => {
		expect(
			honestEntry({
				ts: '2026-07-25T00:00:00.000Z',
				tool: 'demo',
				outcome: 'ok',
				meta: { isError: true },
			}).outcome,
		).toBe('error');
	});

	it('preserves ok when meta.isError is undefined', () => {
		expect(
			honestEntry({
				ts: '2026-07-25T00:00:00.000Z',
				tool: 'demo',
				outcome: 'ok',
			}).outcome,
		).toBe('ok');
	});

	it('rewrites a file in place, skips malformed lines, and handles empty files', async () => {
		const path = join(root, 'events.jsonl');
		writeFileSync(
			path,
			[
				JSON.stringify({
					ts: '2026-07-25T00:00:00.000Z',
					tool: 't1',
					outcome: 'ok',
					meta: { isError: true },
				}),
				'not-json',
				JSON.stringify({
					ts: '2026-07-25T00:01:00.000Z',
					tool: 't2',
					outcome: 'ok',
				}),
			].join('\n'),
			'utf8',
		);
		const result = await honestRewriteFile({ source: path });
		expect(result).toEqual({ processed: 2, rewritten: 1 });
		const lines = readFileSync(path, 'utf8').trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0] ?? '{}').outcome).toBe('error');
		expect(JSON.parse(lines[1] ?? '{}').outcome).toBe('ok');

		const empty = join(root, 'empty.jsonl');
		writeFileSync(empty, '', 'utf8');
		expect(await honestRewriteFile({ source: empty })).toEqual({
			processed: 0,
			rewritten: 0,
		});
		expect(readFileSync(empty, 'utf8')).toBe('');
	});

	it('rewrites raw JSONL content to a separate destination', async () => {
		const dest = join(root, 'raw-output.jsonl');
		const source = [
			JSON.stringify({
				ts: '2026-07-25T00:00:00.000Z',
				tool: 'raw1',
				outcome: 'ok',
				meta: { isError: true },
			}),
			JSON.stringify({
				ts: '2026-07-25T00:01:00.000Z',
				tool: 'raw2',
				outcome: 'idle',
			}),
		].join('\n');
		const result = await honestRewriteFile({ source, dest });
		expect(result).toEqual({ processed: 2, rewritten: 1 });
		const lines = readFileSync(dest, 'utf8').trim().split('\n');
		expect(JSON.parse(lines[0] ?? '{}').outcome).toBe('error');
		expect(JSON.parse(lines[1] ?? '{}').outcome).toBe('idle');
	});

	it('rewrites all 19 catalogued events in one pass', async () => {
		const path = join(root, 'catalog.jsonl');
		const entries = Array.from({ length: 19 }, (_, index) =>
			JSON.stringify({
				ts: `2026-07-25T00:${String(index).padStart(2, '0')}:00.000Z`,
				tool: `tool-${index}`,
				outcome: 'ok',
				meta: { isError: index % 2 === 0 },
			}),
		);
		writeFileSync(path, `${entries.join('\n')}\n`, 'utf8');
		const result = await honestRewriteFile({ source: path });
		expect(result.processed).toBe(19);
		expect(result.rewritten).toBe(10);
		const rewritten = readFileSync(path, 'utf8')
			.trim()
			.split('\n')
			.map(
				(line) =>
					JSON.parse(line) as {
						outcome: string;
						meta?: { isError?: boolean };
					},
			);
		rewritten
			.filter((entry) => entry.meta?.isError === true)
			.forEach((entry) => {
				expect(entry.outcome).toBe('error');
			});
	});
});
