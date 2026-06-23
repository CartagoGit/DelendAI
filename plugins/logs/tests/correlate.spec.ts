import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { correlateEvents } from '../src/lib/services/correlate';
import { createLogStore } from '../src/lib/services/log-store';
import { normalizeEvent } from '../src/lib/services/normalize-event';

describe('correlateEvents', () => {
	it('builds a task chain and detects long gaps', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'mcp-vertex-correlate-'));
		const store = createLogStore(dir);
		await store.appendEvent(
			normalizeEvent(
				'lock-claimed',
				{ taskId: 'f00015-s1' },
				new Date('2026-06-20T10:00:00.000Z'),
			),
		);
		await store.appendEvent(
			normalizeEvent(
				'tool-started',
				{ taskId: 'f00015-s1', toolName: 'logs_query' },
				new Date('2026-06-20T10:02:30.000Z'),
			),
		);
		await store.appendEvent(
			normalizeEvent(
				'tool-completed',
				{ taskId: 'f00015-s1', toolName: 'logs_query' },
				new Date('2026-06-20T10:02:31.000Z'),
			),
		);

		const result = await correlateEvents(store, {
			taskId: 'f00015-s1',
			gapMs: 60_000,
		});

		expect(result.chain.map((event) => event.kind)).toEqual([
			'lock-claimed',
			'tool-started',
			'tool-completed',
		]);
		expect(result.gaps).toHaveLength(1);
		expect(result.firstTs).toBe('2026-06-20T10:00:00.000Z');
	});

	it('requires exactly one correlation key', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'mcp-vertex-correlate-'));
		const store = createLogStore(dir);
		await expect(correlateEvents(store, {})).rejects.toThrow(
			'Provide exactly one',
		);
	});
});
