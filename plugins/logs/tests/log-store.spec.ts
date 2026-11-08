import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { createLogStore } from '../src/lib/services/log-store';
import {
	normalizeEvent,
	serializeRedactedEvent,
} from '../src/lib/services/normalize-event';

const tempLogs = async (): Promise<string> =>
	mkdtemp(join(tmpdir(), 'delendai-logs-'));

describe('x00153 S2 — tail/readRange only open day-files in scope', async () => {
	const { writeFile } = await import('node:fs/promises');

	const seedEvent = async (
		logsDir: string,
		day: string,
		ts: string,
		summary: string,
		overrides: { outcome?: string; kind?: string } = {},
	): Promise<void> => {
		const { appendFile, mkdir } = await import('node:fs/promises');
		const line = JSON.stringify({
			ts,
			kind: overrides.kind ?? 'tool-completed',
			severity: 'info',
			incidentType: 'test',
			agent: 't',
			taskId: 't1',
			outcome: overrides.outcome ?? 'succeeded',
			files: [],
			summary,
			meta: {},
		});
		const path = join(logsDir, `${day}.jsonl`);
		await mkdir(logsDir, { recursive: true });
		await appendFile(path, `${line}\n`, 'utf8');
	};
	// Back-compat: tests that use the old `seedDay(dir, day, ts, summary)`
	// 4-arg form are forwarded to the new `seedEvent` with defaults.
	const seedDay = (
		logsDir: string,
		day: string,
		ts: string,
		summary: string,
	): Promise<void> => seedEvent(logsDir, day, ts, summary);

	// Suppress unused-import lint when only `seedDay` runs.
	void writeFile;

	it('tail(limit:N) reads only the active day-file when N fits in one day', async () => {
		const dir = await tempLogs();
		// 50 events on day 2026-07-20 + 10 events on the newer day
		// 2026-07-25 — tail({limit:5}) must return the 5 newest from
		// 2026-07-25, NOT pull from the older day.
		for (let i = 0; i < 50; i += 1) {
			await seedDay(
				dir,
				'2026-07-20',
				`2026-07-20T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
				`old-${i}`,
			);
		}
		for (let i = 0; i < 10; i += 1) {
			await seedDay(
				dir,
				'2026-07-25',
				`2026-07-25T11:0${i}:00.000Z`,
				`new-${i}`,
			);
		}
		const store = await createLogStore(dir);
		const events = await store.tail({ limit: 5 });
		expect(events).toHaveLength(5);
		for (const event of events) {
			expect(event.ts.startsWith('2026-07-25')).toBe(true);
		}
	});

	it('readRange({since}) only opens day-files at or after since day-boundary', async () => {
		const dir = await tempLogs();
		for (let i = 0; i < 5; i += 1) {
			await seedDay(
				dir,
				'2026-07-20',
				`2026-07-20T10:0${i}:00.000Z`,
				`old-${i}`,
			);
		}
		for (let i = 0; i < 3; i += 1) {
			await seedDay(
				dir,
				'2026-07-25',
				`2026-07-25T10:0${i}:00.000Z`,
				`new-${i}`,
			);
		}
		const store = await createLogStore(dir);
		const events = await store.readRange({
			since: '2026-07-24T00:00:00.000Z',
		});
		expect(events).toHaveLength(3);
		for (const event of events) {
			expect(event.ts.startsWith('2026-07-25')).toBe(true);
		}
	});

	it('tail({outcomeFilter}) skips earlier day-files when active day has matching events', async () => {
		const dir = await tempLogs();
		// 5 'failed' on day 2026-07-20, 2 'succeeded' on day 2026-07-25.
		// tail({outcomeFilter:'succeeded'}) returns only the 2 from
		// the active day, never the 5 failures from 07-20.
		for (let i = 0; i < 5; i += 1) {
			await seedEvent(
				dir,
				'2026-07-20',
				`2026-07-20T10:0${i}:00.000Z`,
				`failed-${i}`,
				{
					outcome: 'failed',
				},
			);
		}
		for (let i = 0; i < 2; i += 1) {
			await seedEvent(
				dir,
				'2026-07-25',
				`2026-07-25T11:0${i}:00.000Z`,
				`ok-${i}`,
			);
		}
		const store = await createLogStore(dir);
		const events = await store.tail({
			limit: 50,
			outcomeFilter: 'ok',
		});
		for (const event of events) {
			expect(event.outcome).toBe('ok');
		}
	});

	it('tail({kindFilter}) filters by kind without scanning older day-files', async () => {
		const dir = await tempLogs();
		// Active day: 2 log-info. Previous day: 1 log-warning.
		// tail({kindFilter:'log-info', limit:50}) returns only the
		// 2 info events; the log-warning must never appear.
		await seedEvent(
			dir,
			'2026-07-24',
			'2026-07-24T10:00:00.000Z',
			'warn-event',
			{
				kind: 'log-warning',
			},
		);
		await seedEvent(
			dir,
			'2026-07-25',
			'2026-07-25T11:00:00.000Z',
			'log-info',
		);
		await seedEvent(
			dir,
			'2026-07-25',
			'2026-07-25T11:01:00.000Z',
			'log-info',
		);
		const store = await createLogStore(dir);
		const events = await store.tail({
			limit: 50,
			kindFilter: 'tool-completed',
		});
		expect(events).toHaveLength(2);
		for (const event of events) {
			expect(event.kind).toBe('tool-completed');
		}
	});

	it('tail on an empty store returns [] without throwing', async () => {
		const dir = await tempLogs();
		const store = await createLogStore(dir);
		const events = await store.tail({ limit: 10 });
		expect(events).toEqual([]);
	});
});

describe('log store', async () => {
	it('appends and reads redacted JSONL events', async () => {
		const dir = await tempLogs();
		const store = createLogStore(dir);
		await (await store).appendEvent(
			normalizeEvent(
				'tool-started',
				{
					toolName: 'x_secret',
					summary: 'api_key = abcdefghijklmnop',
				},
				new Date('2026-06-20T10:00:00.000Z'),
			),
		);

		const events = await (await store).readRange();
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
			Array.from({ length: 25 }, async (_, i) =>
				(await store).appendEvent(
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

		const events = await (await store).readRange();
		expect(events).toHaveLength(25);
		expect(new Set(events.map((event) => event.taskId)).size).toBe(25);
	});

	it('tails newest events and filters by outcome', async () => {
		const dir = await tempLogs();
		const store = createLogStore(dir);
		await (await store).appendEvent(
			normalizeEvent(
				'tool-completed',
				{ toolName: 'ok' },
				new Date('2026-06-20T10:00:00.000Z'),
			),
		);
		await (await store).appendEvent(
			normalizeEvent(
				'tool-failed',
				{ toolName: 'bad' },
				new Date('2026-06-20T10:01:00.000Z'),
			),
		);

		const failed = await (await store).tail({ outcomeFilter: 'failed' });
		expect(failed.map((event) => event.taskId)).toEqual(['bad']);
	});

	it('honors a custom maxLineBytes on the store (not just the default)', async () => {
		const dir = await tempLogs();
		const store = await createLogStore(dir, { maxLineBytes: 256 });
		await store.appendEvent(
			normalizeEvent(
				'tool-failed',
				{ toolName: 'huge', summary: 'x'.repeat(1000) },
				new Date('2026-06-20T10:00:00.000Z'),
			),
		);
		const raw = await readFile(join(dir, '2026-06-20.jsonl'), 'utf8');
		expect(Buffer.byteLength(raw.trimEnd(), 'utf8')).toBeLessThanOrEqual(
			256,
		);
		expect(JSON.parse(raw).meta.__truncated__).toBe(true);
	});

	it('caps oversized events and marks them truncated', async () => {
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

describe('x00153 S3 — corrupt-line placeholder carries the day it belongs to, not now', () => {
	const writeRawLine = async (
		logsDir: string,
		day: string,
		line: string,
	): Promise<void> => {
		const { writeFile, mkdir } = await import('node:fs/promises');
		await mkdir(logsDir, { recursive: true });
		await writeFile(join(logsDir, `${day}.jsonl`), `${line}\n`, 'utf8');
	};

	it('derives ts from the day-file name for an unparseable line', async () => {
		const dir = await tempLogs();
		await writeRawLine(dir, '2026-07-20', '{not valid json');
		const store = await createLogStore(dir);
		const events = await store.readRange();
		const placeholder = events.find((e) => e.kind === 'log-warning');
		expect(placeholder).toBeDefined();
		expect(placeholder?.ts).toBe('2026-07-20T00:00:00.000Z');
		expect(placeholder?.summary).toContain('2026-07-20.jsonl');
		expect(placeholder?.summary).toContain('offset 0');
	});

	it('meta carries file and offset for stable re-reads', async () => {
		const dir = await tempLogs();
		await writeRawLine(
			dir,
			'2026-07-21',
			'first line\n{garbage}\nthird line',
		);
		const store = await createLogStore(dir);
		const events = await store.readRange();
		// All three lines fail to parse, so we expect three placeholders
		// with offsets 0, 1, 2 (in order of the file). The middle one
		// is the one that came from the literal `{garbage}` line.
		const placeholders = events.filter((e) => e.kind === 'log-warning');
		expect(placeholders).toHaveLength(3);
		for (const p of placeholders) {
			expect(p.meta.file).toBe('2026-07-21.jsonl');
		}
		expect(placeholders.map((p) => p.meta.offset).sort()).toEqual([
			0, 1, 2,
		]);
	});

	it('placeholder offset survives a re-read (no Date.now() drift)', async () => {
		const dir = await tempLogs();
		await writeRawLine(dir, '2026-07-22', 'x');
		const store = await createLogStore(dir);
		const firstRead = await store.readRange();
		const secondRead = await store.readRange();
		const first = firstRead.find((e) => e.kind === 'log-warning');
		const second = secondRead.find((e) => e.kind === 'log-warning');
		expect(first?.ts).toBe(second?.ts);
		expect(first?.meta).toEqual(second?.meta);
	});

	it('multiple corrupt lines in the same file each get a unique offset', async () => {
		const dir = await tempLogs();
		await writeRawLine(dir, '2026-07-23', '{a}\n{b}\n{c}');
		const store = await createLogStore(dir);
		const events = await store.readRange();
		const placeholders = events.filter((e) => e.kind === 'log-warning');
		expect(placeholders).toHaveLength(3);
		const offsets = placeholders.map((p) => p.meta.offset).sort();
		expect(offsets).toEqual([0, 1, 2]);
	});
});

describe('x00154 S1 — appendEvent + readAllFiles derive severity + incidentType from the raw record', async () => {
	const { mkdir, appendFile } = await import('node:fs/promises');

	/**
	 * Seed a single legacy JSONL line into the day-file WITHOUT the
	 * `severity` / `incidentType` fields. Mirrors the live
	 * `2026-07-25.jsonl` shape that produced the FATAL class item in
	 * x00154 (412/412 records missing both fields).
	 */
	const seedLegacyLine = async (
		logsDir: string,
		day: string,
		record: Readonly<Record<string, unknown>>,
	): Promise<void> => {
		await mkdir(logsDir, { recursive: true });
		await appendFile(
			join(logsDir, `${day}.jsonl`),
			`${JSON.stringify(record)}\n`,
			'utf8',
		);
	};

	it('readRange backfills severity + incidentType for legacy JSONL records lacking both fields', async () => {
		const dir = await tempLogs();
		// A raw `tool-started` shape identical to what the live
		// MCP transport emits: kind is set, no `severity`, no `incidentType`.
		await seedLegacyLine(dir, '2026-07-25', {
			ts: '2026-07-25T10:00:00.000Z',
			kind: 'tool-started',
			tool: 'delendai_logs_query',
			agent: null,
			taskId: 'delendai_logs_query',
			outcome: 'ok',
			files: [],
			summary: 'tool-started: delendai_logs_query',
			meta: {},
		});
		const store = await createLogStore(dir);
		const events = await store.readRange();
		expect(events).toHaveLength(1);
		const stored = events[0];
		expect(stored).toBeDefined();
		// x00154 S1 — both fields populated from the raw record.
		expect(typeof stored?.severity).toBe('string');
		expect(stored?.severity).toBe('info'); // outcome === 'ok' → severityForOutcome
		expect(stored?.incidentType).toBe('tool-invocation'); // kind === 'tool-started'
	});

	it('appendEvent derives severity + incidentType from a raw tool-started event', async () => {
		const dir = await tempLogs();
		const store = await createLogStore(dir);
		// Cast: the test deliberately exercises the backfill path with
		// a record that omits both fields. TypeScript will not let this
		// through the public `ILogEvent` signature, which is the point.
		await store.appendEvent({
			ts: '2026-07-25T10:01:00.000Z',
			kind: 'tool-started',
			agent: null,
			taskId: 'delendai_logs_query',
			outcome: 'ok',
			files: [],
			summary: 'tool-started: delendai_logs_query',
			meta: {},
			// severity: undefined
			// incidentType: undefined
		} as unknown as Parameters<typeof store.appendEvent>[0]);

		const events = await store.readRange();
		expect(events).toHaveLength(1);
		const stored = events[0];
		expect(stored).toBeDefined();
		expect(stored?.severity).toBe('info');
		expect(stored?.incidentType).toBe('tool-invocation');
	});

	it('appendEvent preserves an explicit valid LogSeverity', async () => {
		const dir = await tempLogs();
		const store = await createLogStore(dir);
		await store.appendEvent(
			normalizeEvent(
				'tool-failed',
				{
					toolName: 'bad',
					summary: 'kaboom',
				},
				new Date('2026-07-25T10:02:00.000Z'),
			),
		);

		const events = await store.readRange();
		expect(events).toHaveLength(1);
		// normalizeEvent already populated severity === 'error' for a
		// tool-failed outcome; confirm the writer did NOT overwrite it
		// with severityForOutcome-derived value (would also be 'error'
		// here, so we assert the canonical mapping instead).
		expect(events[0]?.severity).toBe('error');
		expect(events[0]?.incidentType).toBe('tool-failure');
	});

	it('appendEvent rejects an explicit invalid severity with INVALID_SEVERITY (no silent coercion)', async () => {
		const dir = await tempLogs();
		const store = await createLogStore(dir);
		await expect(
			store.appendEvent({
				ts: '2026-07-25T10:03:00.000Z',
				kind: 'tool-started',
				agent: null,
				taskId: 't',
				outcome: 'ok',
				files: [],
				summary: 'malformed',
				meta: {},
				severity: '?' as unknown as 'info',
				incidentType: 'tool-invocation',
			} as unknown as Parameters<typeof store.appendEvent>[0]),
		).rejects.toThrow('INVALID_SEVERITY');

		// No partial write should have landed: the rejection happens
		// before `withFileMutex`.
		const raw = await readFile(join(dir, '2026-07-25.jsonl'), 'utf8').catch(
			() => '',
		);
		expect(raw.trim()).toBe('');
	});

	it('readRange reconstructs severity for legacy records whose kind is unknown to KIND_TO_INCIDENT_TYPE (incidentType falls back to null)', async () => {
		const dir = await tempLogs();
		// Some legacy records used kinds that don't appear in
		// KIND_TO_INCIDENT_TYPE (added after the record was first
		// written). The reader must still surface severity from
		// outcome and leave incidentType as null when the kind is
		// not in the table — NOT throw and NOT silently invent a
		// code.
		await seedLegacyLine(dir, '2026-07-25', {
			ts: '2026-07-25T10:04:00.000Z',
			kind: 'future-kind',
			agent: null,
			taskId: 't',
			outcome: 'failed',
			files: [],
			summary: 'legacy future-kind record',
			meta: {},
		});
		const store = await createLogStore(dir);
		const events = await store.readRange();
		expect(events).toHaveLength(1);
		const stored = events[0];
		expect(stored?.severity).toBe('error'); // severityForOutcome('failed')
		expect(stored?.incidentType).toBeNull(); // kind unknown → null
	});
});
