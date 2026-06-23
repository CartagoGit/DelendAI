import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { createLogStore } from '../src/lib/services/log-store';
import {
	normalizeEvent,
	serializeRedactedEvent,
} from '../src/lib/services/normalize-event';

const tempLogs = async (): Promise<string> =>
	mkdtemp(join(tmpdir(), 'mcp-vertex-logs-'));

describe('log store', () => {
	it('appends and reads redacted JSONL events', async () => {
		const dir = await tempLogs();
		const store = createLogStore(dir);
		await store.appendEvent(
			normalizeEvent(
				'tool-started',
				{
					toolName: 'x_secret',
					summary: 'api_key = abcdefghijklmnop',
				},
				new Date('2026-06-20T10:00:00.000Z'),
			),
		);

		const events = await store.readRange();
		expect(events).toHaveLength(1);
		expect(events[0]?.summary).toContain('[REDACTED]');
		expect(await readFile(join(dir, '2026-06-20.jsonl'), 'utf8')).toContain(
			'[REDACTED]',
		);
	});

	it('keeps concurrent appenders as complete JSON lines', async () => {
		const dir = await tempLogs();
		const store = createLogStore(dir);
		await Promise.all(
			Array.from({ length: 25 }, (_, i) =>
				store.appendEvent(
					normalizeEvent(
						'tool-completed',
						{
							toolName: `tool_${i}`,
							taskId: `task-${i}`,
						},
						new Date(
							`2026-06-20T10:00:${String(i).padStart(2, '0')}.000Z`,
						),
					),
				),
			),
		);

		const events = await store.readRange();
		expect(events).toHaveLength(25);
		expect(new Set(events.map((event) => event.taskId)).size).toBe(25);
	});

	it('tails newest events and filters by outcome', async () => {
		const dir = await tempLogs();
		const store = createLogStore(dir);
		await store.appendEvent(
			normalizeEvent(
				'tool-completed',
				{ toolName: 'ok' },
				new Date('2026-06-20T10:00:00.000Z'),
			),
		);
		await store.appendEvent(
			normalizeEvent(
				'tool-failed',
				{ toolName: 'bad' },
				new Date('2026-06-20T10:01:00.000Z'),
			),
		);

		const failed = await store.tail({ outcomeFilter: 'failed' });
		expect(failed.map((event) => event.taskId)).toEqual(['bad']);
	});

	it('garbage collects only files older than the retention threshold', async () => {
		const dir = await tempLogs();
		await writeFile(join(dir, '2026-05-01.jsonl'), '{}\n');
		await writeFile(join(dir, '2026-06-19.jsonl'), '{}\n');
		const store = createLogStore(dir);

		const removed = await store.gc({
			olderThanDays: 30,
			now: new Date('2026-06-20T00:00:00.000Z'),
		});

		expect(removed.some((path) => path.endsWith('2026-05-01.jsonl'))).toBe(
			true,
		);
		expect(await readFile(join(dir, '2026-06-19.jsonl'), 'utf8')).toBe(
			'{}\n',
		);
	});

	it('caps oversized events and marks them truncated', () => {
		const line = serializeRedactedEvent(
			normalizeEvent('tool-failed', {
				toolName: 'huge',
				summary: 'x'.repeat(30_000),
				payload: 'x'.repeat(30_000),
			}),
			1024,
		);

		expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(1024);
		expect(JSON.parse(line).meta.__truncated__).toBe(true);
	});
});
