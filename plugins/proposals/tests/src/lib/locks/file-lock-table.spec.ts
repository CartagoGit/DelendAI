import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	type IFileLockTableLogEvent,
	LocksFileCorruptError,
	listRecentFileLockContentions,
	noteFileLockContention,
	readFileLockTable,
	releaseFileLocks,
	resolveFileLockContentions,
	tryAcquireFileLocks,
} from '../../../../src/lib/locks/file-lock-table';

/**
 * Canonical test scratch location: the cache root the repo declares
 * exactly once (single source of truth in `DEFAULT_CORE_PATHS.cacheDir`,
 * enforced by `tools/scripts/lint/check-cache.script.ts`). Hardcoding
 * `.cache/mcp-vertex/verify-tmp/` here keeps the three lock specs in
 * sync with the rest of the repo — the previous `.verify-tmp/` at the
 * repo root was a regression: a stray scratch dir that the
 * `check-cache` lint already flags as out-of-place.
 */
const makeVerifyTmpDir = (prefix: string): string => {
	const root = join(process.cwd(), '.cache', 'mcp-vertex', 'verify-tmp');
	mkdirSync(root, { recursive: true });
	return mkdtempSync(join(root, prefix));
};

describe('file-lock-table', () => {
	let dir = '';
	let tablePath = '';

	beforeEach(() => {
		dir = makeVerifyTmpDir('file-lock-table-');
		tablePath = join(dir, 'file-locks.json');
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('keeps file -> agent ownership in the persistent table', async () => {
		const acquired = await tryAcquireFileLocks({
			agentId: 'agent-a',
			taskId: 'task-a',
			files: ['src/a.ts', 'src/b.ts'],
			tablePath,
			now: () => '2026-07-25T10:00:00.000Z',
		});

		expect(acquired).toEqual({ ok: true });
		expect(await readFileLockTable({ tablePath })).toEqual({
			'src/a.ts': {
				agentId: 'agent-a',
				mtime: '2026-07-25T10:00:00.000Z',
				taskId: 'task-a',
			},
			'src/b.ts': {
				agentId: 'agent-a',
				mtime: '2026-07-25T10:00:00.000Z',
				taskId: 'task-a',
			},
		});
	});

	it('records and resolves file-level contention history without losing the lock map', async () => {
		await tryAcquireFileLocks({
			agentId: 'holder',
			taskId: 'task-holder',
			files: ['src/shared.ts'],
			tablePath,
			now: () => '2026-07-25T10:00:00.000Z',
		});

		const recorded = await noteFileLockContention({
			kind: 'disjoint',
			waitingTaskId: 'task-waiter',
			waitingAgentId: 'waiter',
			holderTaskId: 'task-holder',
			holderAgentId: 'holder',
			files: ['src/shared.ts'],
			tablePath,
			now: () => '2026-07-25T10:00:06.000Z',
		});

		expect(recorded.heldMs).toBe(0);
		expect(await readFileLockTable({ tablePath })).toEqual({
			'src/shared.ts': {
				agentId: 'holder',
				mtime: '2026-07-25T10:00:00.000Z',
				taskId: 'task-holder',
			},
		});

		await resolveFileLockContentions({
			waitingTaskId: 'task-waiter',
			tablePath,
			now: () => '2026-07-25T10:00:08.000Z',
		});

		const history = await listRecentFileLockContentions({
			tablePath,
			now: () => '2026-07-25T10:00:10.000Z',
		});
		expect(history).toHaveLength(1);
		expect(history[0]?.resolvedAt).toBe('2026-07-25T10:00:08.000Z');

		await releaseFileLocks({
			agentId: 'holder',
			files: ['src/shared.ts'],
			tablePath,
		});
		expect(await readFileLockTable({ tablePath })).toEqual({});
	});

	it('reads the legacy plain-map format without dropping ownership', async () => {
		writeFileSync(
			tablePath,
			JSON.stringify({
				'src/legacy.ts': {
					agentId: 'legacy-agent',
					mtime: '2026-07-25T09:00:00.000Z',
					taskId: 'legacy-task',
				},
			}),
		);

		expect(await readFileLockTable({ tablePath })).toEqual({
			'src/legacy.ts': {
				agentId: 'legacy-agent',
				mtime: '2026-07-25T09:00:00.000Z',
				taskId: 'legacy-task',
			},
		});
	});

	// x00154 S5 — `readContentions` distinguishes a missing contention
	// file (ENOENT → silent fallback, no log) from a corrupt one
	// (SyntaxError → typed log-warning + typed error + fallback).
	describe('readContentions (x00154 S5)', () => {
		const contentionPath = (dir: string): string =>
			join(dir, 'file-lock-contentions.json');

		const makeRecorder = (): {
			readonly events: IFileLockTableLogEvent[];
			readonly emit: (event: IFileLockTableLogEvent) => Promise<void>;
		} => {
			const events: IFileLockTableLogEvent[] = [];
			return {
				events,
				emit: async (event) => {
					events.push(event);
				},
			};
		};

		it('(a) logs a log-warning and falls back to empty history when the contention file is corrupt JSON', async () => {
			writeFileSync(contentionPath(dir), '{ this is not valid json');

			const recorder = makeRecorder();

			const history = await listRecentFileLockContentions({
				tablePath,
				emitLog: recorder.emit,
			});

			expect(history).toEqual([]);
			expect(recorder.events).toHaveLength(1);
			expect(recorder.events[0]?.kind).toBe('log-warning');
			expect(recorder.events[0]?.summary).toContain(contentionPath(dir));
			expect(recorder.events[0]?.file).toBe(contentionPath(dir));
			// Sanity: the typed error is exported and is a real Error.
			const sample = new LocksFileCorruptError(
				contentionPath(dir),
				new SyntaxError('synthetic'),
			);
			expect(sample).toBeInstanceOf(Error);
			expect(sample.name).toBe('LocksFileCorruptError');
			expect(sample.path).toBe(contentionPath(dir));
		});

		it('(b) logs a log-warning when the contention file is truncated mid-record', async () => {
			writeFileSync(contentionPath(dir), '[{"kind":"disjoint"');

			const recorder = makeRecorder();

			const history = await listRecentFileLockContentions({
				tablePath,
				emitLog: recorder.emit,
			});

			expect(history).toEqual([]);
			expect(recorder.events).toHaveLength(1);
			expect(recorder.events[0]?.kind).toBe('log-warning');
		});

		it('(c) returns empty history and emits no log when the contention file is missing', async () => {
			// Sanity: nothing at contentionPath(dir) yet.
			const recorder = makeRecorder();

			const history = await listRecentFileLockContentions({
				tablePath,
				emitLog: recorder.emit,
			});

			expect(history).toEqual([]);
			expect(recorder.events).toEqual([]);
		});

		it('(d) filters a valid contention file: keeps unresolved entries, drops stale resolved ones', async () => {
			// Two entries: one unresolved (kept), one resolved >60s ago
			// (pruned by the 60s window in `pruneContentions`). The
			// writer is set to 2026-07-25T10:01:00.000Z so the resolved
			// entry is ~5min stale.
			const unresolved: IContentionFixture = {
				kind: 'disjoint',
				waitingTaskId: 'task-waiter',
				waitingAgentId: 'waiter',
				holderTaskId: 'task-holder',
				holderAgentId: 'holder',
				files: ['src/shared.ts'],
				startedAt: '2026-07-25T10:00:00.000Z',
				lastSeenAt: '2026-07-25T10:00:00.000Z',
			};
			const stale: IContentionFixture = {
				kind: 'overlap',
				waitingTaskId: 'task-stale',
				waitingAgentId: 'waiter',
				holderTaskId: 'task-holder',
				holderAgentId: 'holder',
				files: ['src/stale.ts'],
				startedAt: '2026-07-25T09:55:00.000Z',
				lastSeenAt: '2026-07-25T09:55:30.000Z',
				resolvedAt: '2026-07-25T09:55:30.000Z',
			};
			writeFileSync(
				contentionPath(dir),
				JSON.stringify([unresolved, stale], null, 2),
			);

			const recorder = makeRecorder();
			const history = await listRecentFileLockContentions({
				tablePath,
				now: () => '2026-07-25T10:01:00.000Z',
				emitLog: recorder.emit,
			});

			expect(history).toHaveLength(1);
			expect(history[0]?.waitingTaskId).toBe('task-waiter');
			expect(history[0]?.resolvedAt).toBeUndefined();
			// A valid file must never emit a log-warning.
			expect(recorder.events).toEqual([]);
		});
	});
});

interface IContentionFixture {
	readonly kind: 'disjoint' | 'overlap';
	readonly waitingTaskId: string;
	readonly waitingAgentId: string;
	readonly holderTaskId?: string;
	readonly holderAgentId: string;
	readonly files: readonly string[];
	readonly startedAt: string;
	readonly lastSeenAt: string;
	readonly resolvedAt?: string;
}
