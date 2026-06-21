/**
 * persistent-task-queue.spec.ts
 *
 * TDD specs for IPersistentTaskQueue.
 * 14+ cases as enumerated in the proposal.
 *
 * Run: bun test libs/mcp-project -- persistent-task-queue
 */

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	cancel,
	dequeue,
	enqueue,
	expireSweep,
	loadLockSnapshot,
	parseQueue,
	persistQueue,
	promote,
	reportBackpressure,
	subscribe,
} from '@mcp-vertex/proposals/lib/agents/persistent-task-queue';
import type {
	IPersistentTaskEntry,
	IPersistentTaskQueue,
	ILockEntry,
	ILockSnapshot,
} from '@mcp-vertex/proposals/lib/agents/persistent-task-queue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMP_DIRS: string[] = [];

const createTempDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'mcp-vertex-ptq-'));
	TEMP_DIRS.push(dir);
	return dir;
};

afterEach(() => {
	for (const dir of TEMP_DIRS.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

let workDir: string;
beforeEach(() => {
	workDir = createTempDir();
});

const makeEntry = (
	overrides: Partial<IPersistentTaskEntry> = {},
): IPersistentTaskEntry => ({
	taskId: 'test-task-1',
	enqueuedAt: '2026-06-05T10:00:00.000Z',
	priority: 3,
	waitFor: [],
	owner: {
		taskId: 'p40c-t1',
		agentName: 'observation_tower',
		agentSlot: 'proposal_guardian',
	},
	observe: [],
	status: 'queued',
	...overrides,
});

const makeEmptyQueue = (): IPersistentTaskQueue => ({
	version: 1,
	entries: [],
});

const writeQueue = (queuePath: string, queue: unknown): void => {
	writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');
};

const closedTasksPath = (dir: string): string => {
	const p = join(dir, 'closed-tasks.json');
	writeFileSync(p, JSON.stringify([]), 'utf8');
	return p;
};

const emptyLock = (): ILockSnapshot => ({ in_flight: [], recentReleases: [] });

// ---------------------------------------------------------------------------
// Case 1: parseQueue happy path
// ---------------------------------------------------------------------------
describe('parseQueue — happy path', () => {
	it('returns a valid IPersistentTaskQueue with version 1 and entries array', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry = makeEntry();
		writeQueue(queuePath, { version: 1, entries: [entry] });

		const queue = await parseQueue(queuePath, closedTasksPath(dir));

		expect(queue.version).toBe(1);
		expect(queue.entries).toHaveLength(1);
		expect(queue.entries[0]?.taskId).toBe('test-task-1');
		expect(queue.entries[0]?.status).toBe('queued');
	});

	it('accepts a non-canonical agent slot (project-agnostic roles)', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry = makeEntry({
			owner: {
				taskId: 'p40c-t1',
				agentName: 'ext',
				agentSlot: 'custom_reviewer',
			},
		});
		writeQueue(queuePath, { version: 1, entries: [entry] });

		const queue = await parseQueue(queuePath, closedTasksPath(dir));
		expect(queue.entries[0]?.owner.agentSlot).toBe('custom_reviewer');
	});
});

// ---------------------------------------------------------------------------
// Case 2: taskId duplicate
// ---------------------------------------------------------------------------
describe('parseQueue — DUPLICATE_TASK_ID', () => {
	it('throws TaskQueueParseError with code DUPLICATE_TASK_ID when two entries share a taskId', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry1 = makeEntry({ taskId: 'dup-task' });
		const entry2 = makeEntry({
			taskId: 'dup-task',
			enqueuedAt: '2026-06-05T11:00:00.000Z',
		});
		writeQueue(queuePath, { version: 1, entries: [entry1, entry2] });

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'DUPLICATE_TASK_ID',
		});
	});
});

// ---------------------------------------------------------------------------
// Case 3: priority out of range
// ---------------------------------------------------------------------------
describe('parseQueue — INVALID_PRIORITY', () => {
	it('throws INVALID_PRIORITY for priority 0', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry = makeEntry({ priority: 0 as unknown as 1 });
		writeQueue(queuePath, { version: 1, entries: [entry] });

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'INVALID_PRIORITY',
		});
	});

	it('throws INVALID_PRIORITY for priority 6', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry = makeEntry({ priority: 6 as unknown as 5 });
		writeQueue(queuePath, { version: 1, entries: [entry] });

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'INVALID_PRIORITY',
		});
	});
});

// ---------------------------------------------------------------------------
// Case 4: waitFor file missing
// ---------------------------------------------------------------------------
describe('parseQueue — WAIT_FOR_FILE_MISSING', () => {
	it('throws WAIT_FOR_FILE_MISSING when a waitFor file does not exist on disk', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const missingFile = join(dir, 'does-not-exist.ts');
		const entry = makeEntry({
			waitFor: [{ file: missingFile, releasedBy: null }],
		});
		writeQueue(queuePath, { version: 1, entries: [entry] });

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'WAIT_FOR_FILE_MISSING',
		});
	});

	it('accepts waitFor when the file exists on disk', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const realFile = join(dir, 'existing.ts');
		writeFileSync(realFile, '// ok', 'utf8');
		const entry = makeEntry({
			waitFor: [{ file: realFile, releasedBy: null }],
		});
		writeQueue(queuePath, { version: 1, entries: [entry] });

		const queue = await parseQueue(queuePath, closedTasksPath(dir));
		expect(queue.entries[0]?.waitFor[0]?.file).toBe(realFile);
	});

	it('resolves a workspace-relative waitFor.file against the injected root (M7)', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		// The waitFor path is RELATIVE; only resolving it against the injected
		// root finds it. Without the root it would resolve against cwd and fail.
		writeFileSync(join(dir, 'gate.ts'), '// ok', 'utf8');
		const entry = makeEntry({
			waitFor: [{ file: 'gate.ts', releasedBy: null }],
		});
		writeQueue(queuePath, { version: 1, entries: [entry] });

		// With the root: accepted.
		const queue = await parseQueue(queuePath, closedTasksPath(dir), dir);
		expect(queue.entries[0]?.waitFor[0]?.file).toBe('gate.ts');

		// Without the root, the relative path misses (resolved vs cwd).
		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({ code: 'WAIT_FOR_FILE_MISSING' });
	});
});

// ---------------------------------------------------------------------------
// Case 5: observe target unknown
// ---------------------------------------------------------------------------
describe('parseQueue — OBSERVE_TARGET_UNKNOWN', () => {
	it('throws OBSERVE_TARGET_UNKNOWN when observe references a taskId not in closedTasks', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		// closedTasks has p35c-t1 but observe references p35c-t99
		const ctPath = join(dir, 'closed-tasks.json');
		writeFileSync(
			ctPath,
			JSON.stringify([
				{
					taskId: 'p35c-t1',
					closedAt: '2026-06-05T00:00:00.000Z',
					agentName: 'x',
					filesOwned: [],
				},
			]),
			'utf8',
		);
		const entry = makeEntry({ observe: ['p35c-t99'] });
		writeQueue(queuePath, { version: 1, entries: [entry] });

		await expect(parseQueue(queuePath, ctPath)).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'OBSERVE_TARGET_UNKNOWN',
		});
	});

	it('accepts observe when all targets are in closedTasks', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const ctPath = join(dir, 'closed-tasks.json');
		writeFileSync(
			ctPath,
			JSON.stringify([
				{
					taskId: 'p35c-t1',
					closedAt: '2026-06-05T00:00:00.000Z',
					agentName: 'x',
					filesOwned: [],
				},
			]),
			'utf8',
		);
		const entry = makeEntry({ observe: ['p35c-t1'] });
		writeQueue(queuePath, { version: 1, entries: [entry] });

		const queue = await parseQueue(queuePath, ctPath);
		expect(queue.entries[0]?.observe).toContain('p35c-t1');
	});
});

// ---------------------------------------------------------------------------
// Case 6: temporal inconsistency
// ---------------------------------------------------------------------------
describe('parseQueue — TEMPORAL_INCONSISTENCY', () => {
	it('throws TEMPORAL_INCONSISTENCY when status is expired but expiresAt is in the future', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const future = new Date(Date.now() + 1_000_000).toISOString();
		const entry = makeEntry({ status: 'expired', expiresAt: future });
		writeQueue(queuePath, { version: 1, entries: [entry] });

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'TEMPORAL_INCONSISTENCY',
		});
	});
});

// ---------------------------------------------------------------------------
// Case 7: enqueue sorts by priority desc + enqueuedAt asc
// ---------------------------------------------------------------------------
describe('enqueue — sorts by priority desc + enqueuedAt asc', () => {
	it('inserts new entry sorted by priority desc, then enqueuedAt asc', () => {
		const queue = makeEmptyQueue();

		const e1 = makeEntry({
			taskId: 'low-prio',
			priority: 1,
			enqueuedAt: '2026-06-05T10:00:00.000Z',
		});
		const e2 = makeEntry({
			taskId: 'high-prio',
			priority: 5,
			enqueuedAt: '2026-06-05T10:01:00.000Z',
		});
		const e3 = makeEntry({
			taskId: 'mid-prio',
			priority: 3,
			enqueuedAt: '2026-06-05T09:59:00.000Z',
		});

		const q1 = enqueue(queue, e1);
		const q2 = enqueue(q1, e2);
		const q3 = enqueue(q2, e3);

		expect(q3.entries[0]?.taskId).toBe('high-prio');
		expect(q3.entries[1]?.taskId).toBe('mid-prio');
		expect(q3.entries[2]?.taskId).toBe('low-prio');
	});

	it('breaks priority ties by enqueuedAt asc (older first)', () => {
		const queue = makeEmptyQueue();

		const early = makeEntry({
			taskId: 'early',
			priority: 3,
			enqueuedAt: '2026-06-05T08:00:00.000Z',
		});
		const late = makeEntry({
			taskId: 'late',
			priority: 3,
			enqueuedAt: '2026-06-05T09:00:00.000Z',
		});

		const q = enqueue(enqueue(queue, late), early);
		expect(q.entries[0]?.taskId).toBe('early');
		expect(q.entries[1]?.taskId).toBe('late');
	});
});

// ---------------------------------------------------------------------------
// Case 8: dequeue mutates to consumed
// ---------------------------------------------------------------------------
describe('dequeue — mutates status to consumed', () => {
	it('marks entry as consumed and sets consumedAt', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry = makeEntry({ taskId: 'to-consume' });
		const queue = enqueue(makeEmptyQueue(), entry);

		const { queue: updated, entry: consumed } = await dequeue(
			queue,
			'to-consume',
			queuePath,
		);

		expect(consumed.status).toBe('consumed');
		expect(consumed.consumedAt).toBeDefined();
		const persistedStr = readFileSync(queuePath, 'utf8');
		const persisted = JSON.parse(persistedStr) as IPersistentTaskQueue;
		expect(persisted.entries[0]?.status).toBe('consumed');
		// updated queue also has consumed status
		expect(updated.entries[0]?.status).toBe('consumed');
	});
});

// ---------------------------------------------------------------------------
// Case 9: promote succeeds when lock is empty
// ---------------------------------------------------------------------------
describe('promote — succeeds when lock empty', () => {
	it('promotes a queued entry to promoted when no in_flight conflicts', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const realFile = join(dir, 'some-file.ts');
		writeFileSync(realFile, '// ok', 'utf8');

		const entry = makeEntry({
			taskId: 'promotable',
			waitFor: [{ file: realFile, releasedBy: null }],
		});
		const queue = enqueue(makeEmptyQueue(), entry);

		const result = await promote(
			queue,
			'promotable',
			emptyLock(),
			queuePath,
		);

		expect(result.promoted).toBe(true);
		if (result.promoted) {
			expect(result.entry.status).toBe('promoted');
			expect(result.entry.promotedAt).toBeDefined();
		}
	});
});

// ---------------------------------------------------------------------------
// Case 10: promote blocked when file in use
// ---------------------------------------------------------------------------
describe('promote — blocked when file in use by in_flight', () => {
	it('returns promoted:false with blockedBy when in_flight holds the file', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const reservedFile = join(dir, 'reserved.ts');
		writeFileSync(reservedFile, '// ok', 'utf8');

		const entry = makeEntry({
			taskId: 'blocked-task',
			waitFor: [{ file: reservedFile, releasedBy: 'another-task' }],
		});
		const queue = enqueue(makeEmptyQueue(), entry);

		const lock: ILockSnapshot = {
			in_flight: [
				{
					task_id: 'another-task',
					agent: 'some_agent',
					ownership: [reservedFile],
					started_at: '2026-06-05T10:00:00.000Z',
				} satisfies ILockEntry,
			],
			recentReleases: [],
		};

		const result = await promote(queue, 'blocked-task', lock, queuePath);

		expect(result.promoted).toBe(false);
		if (!result.promoted) {
			expect(result.blockedBy).toHaveLength(1);
			expect(result.blockedBy[0]?.file).toBe(reservedFile);
		}
	});
});

// ---------------------------------------------------------------------------
// Case 11: cancel
// ---------------------------------------------------------------------------
describe('cancel — marks entry as cancelled', () => {
	it('marks an entry cancelled with cancelledAt and persists to disk', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const entry = makeEntry({ taskId: 'cancellable' });
		const queue = enqueue(makeEmptyQueue(), entry);

		const { queue: updated } = await cancel(
			queue,
			'cancellable',
			'test reason',
			queuePath,
		);

		expect(updated.entries[0]?.status).toBe('cancelled');
		expect(updated.entries[0]?.cancelledAt).toBeDefined();

		const persistedStr = readFileSync(queuePath, 'utf8');
		const persisted = JSON.parse(persistedStr) as IPersistentTaskQueue;
		expect(persisted.entries[0]?.status).toBe('cancelled');
	});
});

// ---------------------------------------------------------------------------
// Case 12: expireSweep
// ---------------------------------------------------------------------------
describe('expireSweep — expires entries past expiresAt', () => {
	it('marks expired entries and returns expiredCount', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');

		const pastExpiry = new Date(Date.now() - 1000).toISOString();
		const futureExpiry = new Date(Date.now() + 1_000_000).toISOString();

		const e1 = makeEntry({ taskId: 'will-expire', expiresAt: pastExpiry });
		const e2 = makeEntry({
			taskId: 'stays-queued',
			expiresAt: futureExpiry,
			enqueuedAt: '2026-06-05T11:00:00.000Z',
		});

		const queue = enqueue(enqueue(makeEmptyQueue(), e1), e2);
		const now = new Date().toISOString();

		const { queue: swept, expiredCount } = await expireSweep(
			queue,
			now,
			queuePath,
		);

		expect(expiredCount).toBe(1);
		const expiredEntry = swept.entries.find(
			(e) => e.taskId === 'will-expire',
		);
		const activeEntry = swept.entries.find(
			(e) => e.taskId === 'stays-queued',
		);
		expect(expiredEntry?.status).toBe('expired');
		expect(activeEntry?.status).toBe('queued');
	});
});

// ---------------------------------------------------------------------------
// Case 13: reportBackpressure — red / amber / green thresholds
// ---------------------------------------------------------------------------
describe('reportBackpressure — threshold logic', () => {
	// Use a fixed "now" so tests are not sensitive to wall-clock time.
	const NOW = '2026-06-05T20:00:00.000Z';
	const recentEnqueuedAt = '2026-06-05T19:55:00.000Z'; // 5 min ago

	it('returns green when queue is nearly empty', () => {
		const queue = enqueue(
			makeEmptyQueue(),
			makeEntry({ taskId: 'single', enqueuedAt: recentEnqueuedAt }),
		);
		const report = reportBackpressure(queue, emptyLock(), NOW);

		expect(report.threshold).toBe('green');
		expect(report.queueLength).toBe(1);
		expect(report.queuedCount).toBe(1);
	});

	it('returns red when queueLength >= 16', () => {
		let queue = makeEmptyQueue();
		for (let i = 0; i < 16; i++) {
			queue = enqueue(
				queue,
				makeEntry({
					taskId: `task-${i}`,
					enqueuedAt: recentEnqueuedAt,
				}),
			);
		}
		const report = reportBackpressure(queue, emptyLock(), NOW);
		expect(report.threshold).toBe('red');
	});

	it('returns amber when queueLength >= 8 and < 16', () => {
		let queue = makeEmptyQueue();
		for (let i = 0; i < 8; i++) {
			queue = enqueue(
				queue,
				makeEntry({
					taskId: `task-${i}`,
					enqueuedAt: recentEnqueuedAt,
				}),
			);
		}
		const report = reportBackpressure(queue, emptyLock(), NOW);
		expect(report.threshold).toBe('amber');
	});

	it('returns red when oldestAgeMinutes >= 240', () => {
		// 241 minutes before NOW
		const oldEnqueuedAt = new Date(
			Date.parse(NOW) - 241 * 60 * 1000,
		).toISOString();
		const queue = enqueue(
			makeEmptyQueue(),
			makeEntry({ taskId: 'old-task', enqueuedAt: oldEnqueuedAt }),
		);
		const report = reportBackpressure(queue, emptyLock(), NOW);
		expect(report.threshold).toBe('red');
		expect(report.oldestAgeMinutes).toBeGreaterThanOrEqual(240);
	});
});

// ---------------------------------------------------------------------------
// Case 14: subscribe — returns digests for closed observe targets
// ---------------------------------------------------------------------------
describe('subscribe — returns digests for observed tasks', () => {
	it('returns digests for closed observe targets', () => {
		const closedTasks = [
			{
				taskId: 'p40c-t0',
				closedAt: '2026-06-05T09:00:00.000Z',
				agentName: 'root_agent',
				filesOwned: ['docs/proposals/p40c.md'],
				diffSummary: 'Created p40c proposal',
			},
		];
		const entry = makeEntry({
			taskId: 'observer-task',
			observe: ['p40c-t0'],
		});
		const queue = enqueue(makeEmptyQueue(), entry);

		const result = subscribe(queue, 'observer-task', closedTasks);

		expect(result.digests).toHaveLength(1);
		expect(result.digests[0]?.taskId).toBe('p40c-t0');
		expect(result.pendingTargets).toHaveLength(0);
	});

	it('returns pendingTargets for observe targets not yet closed', () => {
		const closedTasks: {
			taskId: string;
			closedAt: string;
			agentName: string;
			filesOwned: string[];
			diffSummary?: string;
		}[] = [];
		const entry = makeEntry({
			taskId: 'observer-task',
			observe: ['p40c-t1'],
		});
		const queue = enqueue(makeEmptyQueue(), entry);

		const result = subscribe(queue, 'observer-task', closedTasks);

		expect(result.digests).toHaveLength(0);
		expect(result.pendingTargets).toContain('p40c-t1');
	});
});

// ---------------------------------------------------------------------------
// Case 15: round-trip enqueue + persist + parse
// ---------------------------------------------------------------------------
describe('round-trip — enqueue + persist + reparse', () => {
	it('produces Zod-equal queue after persist and reparse', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		const realFile = join(dir, 'myfile.ts');
		writeFileSync(realFile, '// ok', 'utf8');

		const entry = makeEntry({
			taskId: 'roundtrip-task',
			priority: 5,
			waitFor: [{ file: realFile, releasedBy: null }],
		});
		const queue = enqueue(makeEmptyQueue(), entry);

		await persistQueue(queue, queuePath);

		const reparsed = await parseQueue(queuePath, closedTasksPath(dir));

		expect(reparsed.version).toBe(queue.version);
		expect(reparsed.entries).toHaveLength(1);
		expect(reparsed.entries[0]?.taskId).toBe('roundtrip-task');
		expect(reparsed.entries[0]?.priority).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// M10: corrupt ≠ empty. A torn queue file must NOT parse as an empty queue
// (that would let two agents re-claim the same slice). parseQueue throws a
// PARSE_ERROR and preserves the bytes to a .corrupt-<ts> backup.
// ---------------------------------------------------------------------------
describe('parseQueue — quarantine on corrupt JSON (M10)', () => {
	const backupExists = (dir: string): boolean =>
		readdirSync(dir).some((f) => f.startsWith('queue.json.corrupt-'));

	it('throws PARSE_ERROR and preserves the corrupt bytes', async () => {
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		writeFileSync(queuePath, '{ "version": 1, "entries": [', 'utf8');

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({
			name: 'TaskQueueParseError',
			code: 'PARSE_ERROR',
		});
		expect(existsSync(queuePath)).toBe(false);
		expect(backupExists(dir)).toBe(true);
	});

	it('does NOT quarantine a structurally valid but business-invalid queue', async () => {
		// A duplicate taskId is bad content, not a torn file — the bytes
		// must stay intact so an operator can fix them in place.
		const dir = workDir;
		const queuePath = join(dir, 'queue.json');
		writeQueue(queuePath, {
			version: 1,
			entries: [
				makeEntry({ taskId: 'dup' }),
				makeEntry({ taskId: 'dup' }),
			],
		});

		await expect(
			parseQueue(queuePath, closedTasksPath(dir)),
		).rejects.toMatchObject({ code: 'DUPLICATE_TASK_ID' });
		expect(existsSync(queuePath)).toBe(true);
		expect(backupExists(dir)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// M7: single canonical lock schema. loadLockSnapshot reads exactly what
// `<prefix>_agent_lock` writes (`ownership` + `started_at`). The old dual
// `files`/`claimed_at` shape is no longer accepted (compat layer removed).
// ---------------------------------------------------------------------------
describe('loadLockSnapshot — canonical lock schema (M7)', () => {
	it('reads the canonical ownership/started_at shape', async () => {
		const lockPath = join(workDir, 'agents.lock.json');
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 't1',
						agent: 'aquila',
						ownership: ['src/a.ts', 'src/b.ts'],
						started_at: '2026-06-05T10:00:00.000Z',
						last_seen: '2026-06-05T10:01:00.000Z',
					},
				],
			}),
			'utf8',
		);

		const snap = await loadLockSnapshot(lockPath);
		expect(snap.in_flight).toHaveLength(1);
		expect(snap.in_flight[0]?.ownership).toEqual(['src/a.ts', 'src/b.ts']);
		expect(snap.in_flight[0]?.started_at).toBe('2026-06-05T10:00:00.000Z');
	});

	it('rejects the legacy files/claimed_at shape (treated as no lock)', async () => {
		const lockPath = join(workDir, 'agents.lock.json');
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				in_flight: [
					{
						task_id: 't1',
						agent: 'aquila',
						files: ['src/a.ts'],
						claimed_at: '2026-06-05T10:00:00.000Z',
					},
				],
			}),
			'utf8',
		);

		// The legacy entry fails schema validation, so the whole file is
		// ignored (loadLockSnapshot returns an empty in_flight rather than
		// silently inventing an ownership-less lock).
		const snap = await loadLockSnapshot(lockPath);
		expect(snap.in_flight).toEqual([]);
	});
});
