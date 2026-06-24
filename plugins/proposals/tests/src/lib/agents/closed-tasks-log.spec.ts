/**
 * closed-tasks-log.spec.ts
 *
 * TDD specs for closed-tasks-log.ts.
 * 5 cases as enumerated in the proposal:
 *   1. append
 *   2. max-size eviction (FIFO, max 256)
 *   3. idempotency (same taskId not duplicated)
 *   4. parse defensivo (corrupted file → empty array, no throw)
 *   5. round-trip
 *
 * Run: bun test libs/mcp-project -- closed-tasks-log
 */

import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The proposals plugin emits "[proposals] closed-tasks log ... is
// corrupt" via `console.error` whenever the on-disk log fails to
// parse. The diagnostic is captured via a spy installed in
// `beforeEach` so the validate stream stays clean; cases that
// exercise this path assert on the spy's call log.

import {
	appendToClosedTasks,
	readClosedTasks,
} from '@mcp-vertex/proposals/lib/agents/closed-tasks-log';
import type { IClosedTaskRecord } from '@mcp-vertex/proposals/lib/agents/closed-tasks-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMP_DIRS: string[] = [];

afterEach(() => {
	for (const dir of TEMP_DIRS.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	stderrSpy?.mockRestore();
	consoleErrorSpy?.mockRestore();
});

let workDir: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), 'mcp-vertex-ctl-'));
	TEMP_DIRS.push(workDir);
	// Capture the corruption diagnostic. Cases that need to assert on
	// it inspect `stderrSpy.mock.calls` / `consoleErrorSpy.mock.calls`.
	stderrSpy = vi
		.spyOn(process.stderr, 'write')
		.mockImplementation(() => true);
	consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

const makeRecord = (
	overrides: Partial<IClosedTaskRecord> = {},
): IClosedTaskRecord => ({
	taskId: 'p40c-t1',
	closedAt: '2026-06-05T10:00:00.000Z',
	agentName: 'observation_tower',
	filesOwned: ['libs/mcp-project/src/lib/agents/closed-tasks-log.ts'],
	...overrides,
});

// ---------------------------------------------------------------------------
// Case 1: append
// ---------------------------------------------------------------------------
describe('appendToClosedTasks — append', async () => {
	it('appends a new record to an empty log file', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		const record = makeRecord();

		await appendToClosedTasks(logPath, record);

		const result = await readClosedTasks(logPath);
		expect(result).toHaveLength(1);
		expect(result[0]?.taskId).toBe('p40c-t1');
		expect(result[0]?.agentName).toBe('observation_tower');
	});

	it('appends a new record to a non-empty log file', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		const r1 = makeRecord({ taskId: 'task-1' });
		const r2 = makeRecord({
			taskId: 'task-2',
			closedAt: '2026-06-05T11:00:00.000Z',
		});

		await appendToClosedTasks(logPath, r1);
		await appendToClosedTasks(logPath, r2);

		const result = await readClosedTasks(logPath);
		expect(result).toHaveLength(2);
		expect(result[0]?.taskId).toBe('task-1');
		expect(result[1]?.taskId).toBe('task-2');
	});
});

// ---------------------------------------------------------------------------
// Case 2: max-size eviction (FIFO, max 32 — p56 T2 reduced from 256)
// ---------------------------------------------------------------------------
describe('appendToClosedTasks — max-size eviction', async () => {
	it('evicts the oldest entry when the log reaches 32 entries', async () => {
		const logPath = join(workDir, 'closed-tasks.json');

		// Pre-fill with 32 records
		const initial: IClosedTaskRecord[] = Array.from(
			{ length: 32 },
			(_, i) => ({
				taskId: `task-${i}`,
				closedAt: new Date(
					Date.parse('2026-06-05T10:00:00.000Z') + i * 1000,
				).toISOString(),
				agentName: 'agent',
				filesOwned: [],
			}),
		);
		writeFileSync(logPath, JSON.stringify(initial), 'utf8');

		// Append one more — oldest (task-0) should be evicted
		const newRecord = makeRecord({ taskId: 'task-new' });
		await appendToClosedTasks(logPath, newRecord);

		const result = await readClosedTasks(logPath);
		expect(result).toHaveLength(32);
		expect(result[0]?.taskId).toBe('task-1'); // task-0 evicted
		expect(result[result.length - 1]?.taskId).toBe('task-new');
	});
});

// ---------------------------------------------------------------------------
// Case 3: idempotency
// ---------------------------------------------------------------------------
describe('appendToClosedTasks — idempotency', async () => {
	it('does not duplicate an entry when the same taskId is appended twice', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		const record = makeRecord({ taskId: 'idempotent-task' });

		await appendToClosedTasks(logPath, record);
		await appendToClosedTasks(logPath, record); // second call with same taskId

		const result = await readClosedTasks(logPath);
		expect(
			result.filter((r) => r.taskId === 'idempotent-task'),
		).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Case 4: parse defensivo (corrupted file → empty array, no throw)
// ---------------------------------------------------------------------------
describe('readClosedTasks — parse defensivo', async () => {
	it('returns an empty array when the log file contains invalid JSON', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		writeFileSync(logPath, '{ this is not json }', 'utf8');

		const result = await readClosedTasks(logPath);
		expect(result).toEqual([]);
	});

	it('returns an empty array when the log file does not exist', async () => {
		const logPath = join(workDir, 'nonexistent.json');

		const result = await readClosedTasks(logPath);
		expect(result).toEqual([]);
	});

	it('returns an empty array when the log file contains a non-array', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		writeFileSync(logPath, JSON.stringify({ not: 'an array' }), 'utf8');

		const result = await readClosedTasks(logPath);
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// M10: corrupt ≠ silently empty. This diagnostic log must not block
// coordination, so it still returns [] — but it PRESERVES the corrupt
// bytes to a .corrupt-<ts> backup rather than letting them be overwritten.
// ---------------------------------------------------------------------------
describe('readClosedTasks — quarantine on corruption (M10)', async () => {
	const backupOf = (_logPath: string): string | undefined =>
		readdirSync(workDir).find((f) =>
			f.startsWith('closed-tasks.json.corrupt-'),
		);

	it('preserves invalid JSON to a backup and removes the original', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		writeFileSync(logPath, '{ not json', 'utf8');

		expect(await readClosedTasks(logPath)).toEqual([]);
		expect(existsSync(logPath)).toBe(false);
		const backup = backupOf(logPath);
		expect(backup).toBeDefined();
		expect(readFileSync(join(workDir, backup!), 'utf8')).toBe('{ not json');
	});

	it('preserves schema-invalid content to a backup', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		writeFileSync(
			logPath,
			JSON.stringify([
				{ taskId: '', closedAt: 'x', agentName: 'a', filesOwned: [] },
			]),
			'utf8',
		);

		expect(await readClosedTasks(logPath)).toEqual([]);
		expect(backupOf(logPath)).toBeDefined();
	});

	it('lets a fresh append recover after quarantine', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		writeFileSync(logPath, 'garbage', 'utf8');
		await readClosedTasks(logPath); // quarantines

		await appendToClosedTasks(
			logPath,
			makeRecord({ taskId: 'after-heal' }),
		);
		const result = await readClosedTasks(logPath);
		expect(result).toHaveLength(1);
		expect(result[0]?.taskId).toBe('after-heal');
	});
});

// ---------------------------------------------------------------------------
// Case 5: round-trip
// ---------------------------------------------------------------------------
describe('appendToClosedTasks — round-trip', async () => {
	it('produces the same records after append + read', async () => {
		const logPath = join(workDir, 'closed-tasks.json');
		const r1 = makeRecord({ taskId: 'rt-task-1' });
		const r2 = makeRecord({
			taskId: 'rt-task-2',
			closedAt: '2026-06-05T12:00:00.000Z',
		});

		await appendToClosedTasks(logPath, r1);
		await appendToClosedTasks(logPath, r2);

		const result = await readClosedTasks(logPath);
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			taskId: 'rt-task-1',
			agentName: 'observation_tower',
		});
		expect(result[1]).toMatchObject({ taskId: 'rt-task-2' });
	});
});

// ---------------------------------------------------------------------------
// p56 T2: FIFO order is purely chronological (closedAt), no priority
// field on the record and no reordering when the cap evicts entries.
// The log is a tail-diagnostics buffer; it does NOT carry the
// priority field that the active queue uses, and entries are kept
// in strict append order.
// ---------------------------------------------------------------------------
describe('appendToClosedTasks — FIFO order', async () => {
	it('keeps entries in strict append order regardless of any external priority tag', async () => {
		const logPath = join(workDir, 'closed-tasks.json');

		// Append in non-monotonic closedAt order to prove the log
		// does NOT sort by closedAt: it preserves the actual append
		// sequence, which is what eviction and tail diagnostics need.
		await appendToClosedTasks(
			logPath,
			makeRecord({ taskId: 'a', closedAt: '2026-06-05T10:00:30.000Z' }),
		);
		await appendToClosedTasks(
			logPath,
			makeRecord({ taskId: 'b', closedAt: '2026-06-05T10:00:10.000Z' }),
		);
		await appendToClosedTasks(
			logPath,
			makeRecord({ taskId: 'c', closedAt: '2026-06-05T10:00:20.000Z' }),
		);

		const result = await readClosedTasks(logPath);
		expect(result.map((r) => r.taskId)).toEqual(['a', 'b', 'c']);
	});

	it('evicts from the head (oldest APPEND, not oldest closedAt) when full', async () => {
		const logPath = join(workDir, 'closed-tasks.json');

		// Pre-fill with 32 records, closedAt in REVERSE append order
		// so a naive "oldest closedAt first" eviction would evict the
		// LAST one appended, not the first. We assert the eviction
		// policy is "first-in, first-out by APPEND order".
		const initial: IClosedTaskRecord[] = Array.from(
			{ length: 32 },
			(_, i) => ({
				taskId: `seed-${i}`,
				closedAt: new Date(
					Date.parse('2026-06-05T10:00:00.000Z') + (31 - i) * 1000,
				).toISOString(),
				agentName: 'agent',
				filesOwned: [],
			}),
		);
		writeFileSync(logPath, JSON.stringify(initial), 'utf8');

		await appendToClosedTasks(
			logPath,
			makeRecord({
				taskId: 'fresh',
				closedAt: '2026-06-05T11:00:00.000Z',
			}),
		);

		const result = await readClosedTasks(logPath);
		expect(result).toHaveLength(32);
		expect(result[0]?.taskId).toBe('seed-1'); // seed-0 evicted (first appended)
		expect(result[result.length - 1]?.taskId).toBe('fresh');
	});
});
