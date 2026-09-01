import { appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { readRuntimeEvents } from '../../src/node/runtime-events';

const event = (kind: string, sessionId = 'session-1') =>
	JSON.stringify({
		version: 1,
		ts: '2026-08-30T00:00:00.000Z',
		sessionId,
		kind,
	});

describe('readRuntimeEvents', () => {
	it('returns the original cursor when the stream does not exist', async () => {
		const cursor = { offset: 0, events: [] };
		expect(
			await readRuntimeEvents(
				join(tmpdir(), 'mcp-vertex-missing-runtime-events.jsonl'),
				cursor,
			),
		).toEqual(cursor);
	});

	it('reads new complete lines incrementally and ignores a partial tail', async () => {
		const root = join(
			tmpdir(),
			`mcp-vertex-runtime-events-${Date.now()}-${Math.random()}`,
		);
		const file = join(root, 'events.jsonl');
		try {
			await mkdir(root, { recursive: true });
			await writeFile(
				file,
				`${event('session.started')}\n${event('tool.started')}\npartial`,
				'utf8',
			);

			const first = await readRuntimeEvents(file);
			expect(first.events.map((entry) => entry.kind)).toEqual([
				'session.started',
				'tool.started',
			]);

			await appendFile(file, '\n', 'utf8');
			const second = await readRuntimeEvents(file, first);
			expect(second.events.map((entry) => entry.kind)).toEqual([
				'session.started',
				'tool.started',
			]);
			expect(second.offset).toBeGreaterThan(first.offset);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('resets the cursor after stream rotation', async () => {
		const root = join(
			tmpdir(),
			`mcp-vertex-runtime-rotation-${Date.now()}-${Math.random()}`,
		);
		const file = join(root, 'events.jsonl');
		try {
			await mkdir(root, { recursive: true });
			await writeFile(file, `${event('tool.completed')}\n`, 'utf8');
			const previous = await readRuntimeEvents(file);
			const rotatedFile = join(root, 'events.previous.jsonl');
			await rename(file, rotatedFile);
			await writeFile(
				file,
				`${event('session.started', 'session-2')}\n`,
				'utf8',
			);
			const rotated = await readRuntimeEvents(file, previous);
			expect(rotated.events.map((entry) => entry.sessionId)).toEqual([
				'session-2',
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
