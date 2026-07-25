/**
 * contention-detector.spec.ts — a00072 S8.c acceptance.
 *
 * The detector reads the file-lock table + the in-flight lock
 * snapshot, then reports every pair of tasks that hold overlapping
 * files for more than `windowMs` (default 5s). Tests cover:
 *   - empty lock file → no livelocks
 *   - disjoint file ownership → no livelocks (the S8.b invariant)
 *   - overlapping file ownership within window → no livelocks
 *   - overlapping file ownership past window → 1 livelock pair
 *   - the agents are sorted (alphabetical) for stable output
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectContention } from '../../../../src/lib/locks/contention-detector';
import {
	tryAcquireFileLocks,
	writeFileLockTable,
} from '../../../../src/lib/locks/file-lock-table';

describe('contention-detector (a00072 S8.c)', () => {
	let root = '';
	let lockPath = '';
	let tablePath = '';
	const now = Date.now;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'contention-detector-'));
		lockPath = join(root, 'agents.lock.json');
		tablePath = join(root, 'file-locks.json');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const writeLock = (entries: readonly object[]) => {
		mkdirSync(root, { recursive: true });
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: entries,
			}),
		);
	};

	it('returns no livelocks on an empty lock file', async () => {
		const result = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
		});
		expect(result.livelocks).toEqual([]);
	});

	it('returns no livelocks when two agents hold DISJOINT files (S8.b invariant)', async () => {
		// agent-1 holds src/a.ts, agent-2 holds src/b.ts — no overlap.
		const t1 = Date.now() - 60_000; // 1min ago
		const t2 = Date.now() - 60_000;
		await writeFileLockTable(
			{
				'src/a.ts': {
					agentId: 'agent-1',
					mtime: new Date(t1).toISOString(),
				},
			},
			{ tablePath },
		);
		await tryAcquireFileLocks({
			agentId: 'agent-2',
			files: ['src/b.ts'],
			tablePath,
		});
		// Adjust the second entry's mtime so the helper-recorded "now"
		// doesn't reset the synthetic timing. We re-write the table
		// to force a controlled mtime.
		const table = (
			await import('../../../../src/lib/locks/file-lock-table')
		).readFileLockTable({ tablePath });
		table['src/b.ts'] = {
			agentId: 'agent-2',
			mtime: new Date(t2).toISOString(),
		};
		await writeFileLockTable(table, { tablePath });

		writeLock([
			{
				task_id: 'a1',
				agent: 'agent-1',
				ownership: ['src/a.ts'],
				started_at: new Date(t1).toISOString(),
				last_seen: new Date(t1).toISOString(),
			},
			{
				task_id: 'a2',
				agent: 'agent-2',
				ownership: ['src/b.ts'],
				started_at: new Date(t2).toISOString(),
				last_seen: new Date(t2).toISOString(),
			},
		]);
		const result = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
		});
		expect(result.livelocks).toEqual([]);
	});

	it('reports a livelock when two agents hold OVERLAPPING files past the window', async () => {
		const t = Date.now() - 60_000; // 1min ago, well past 5s window
		await writeFileLockTable(
			{
				'src/shared.ts': {
					agentId: 'agent-1',
					mtime: new Date(t).toISOString(),
				},
			},
			{ tablePath },
		);
		// The detector computes heldAges only when EVERY overlapping file
		// has a table entry — so the second agent must also have an
		// entry for the same file. We forge it directly.
		const table = (
			await import('../../../../src/lib/locks/file-lock-table')
		).readFileLockTable({ tablePath });
		table['src/shared.ts'] = {
			agentId: 'agent-1',
			mtime: new Date(t).toISOString(),
		};
		await writeFileLockTable(table, { tablePath });

		writeLock([
			{
				task_id: 'a1',
				agent: 'agent-1',
				ownership: ['src/shared.ts'],
				started_at: new Date(t).toISOString(),
				last_seen: new Date(t).toISOString(),
			},
			{
				task_id: 'a2',
				agent: 'agent-2',
				ownership: ['src/shared.ts'],
				started_at: new Date(t).toISOString(),
				last_seen: new Date(t).toISOString(),
			},
		]);
		const result = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
		});
		expect(result.livelocks.length).toBe(1);
		const pair = result.livelocks[0];
		// Agents sorted alphabetically — agent-1 first.
		expect(pair?.agentA).toBe('agent-1');
		expect(pair?.agentB).toBe('agent-2');
		expect(pair?.files).toEqual(['src/shared.ts']);
		expect(pair?.heldMs).toBeGreaterThan(5_000);
	});

	it('does NOT report a livelock when overlap is within the window', async () => {
		const t = Date.now() - 1_000; // 1s ago, within 5s window
		await writeFileLockTable(
			{
				'src/shared.ts': {
					agentId: 'agent-1',
					mtime: new Date(t).toISOString(),
				},
			},
			{ tablePath },
		);
		writeLock([
			{
				task_id: 'a1',
				agent: 'agent-1',
				ownership: ['src/shared.ts'],
				started_at: new Date(t).toISOString(),
				last_seen: new Date(t).toISOString(),
			},
			{
				task_id: 'a2',
				agent: 'agent-2',
				ownership: ['src/shared.ts'],
				started_at: new Date(t).toISOString(),
				last_seen: new Date(t).toISOString(),
			},
		]);
		const result = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
		});
		expect(result.livelocks).toEqual([]);
	});
});
