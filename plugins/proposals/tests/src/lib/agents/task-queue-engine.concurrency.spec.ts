/**
 * task-queue-engine.concurrency.spec.ts
 *
 * a00083 F30: the audit's concurrency table marked this engine's `enqueue`
 * action as the only ❌ in the whole proposals plugin — every other
 * concurrent engine (agent-lock-engine, sync-proposal-registry) has a
 * parallel-writer test proving no lost updates under contention.
 *
 * `persistent-task-queue.ts`'s `enqueue`/`persistQueue`/`parseQueue` are
 * intentionally bare primitives with no locking of their own — the
 * read-modify-write serialization lives one layer up, in
 * `runTaskQueueAction`'s `withFileMutex(paths.queuePath, ...)` wrapper. A
 * parallel-writer test against the bare primitives would exercise a
 * caller pattern nothing in this codebase actually uses (bypassing the
 * mutex); this test instead exercises the real, mutex-protected entry
 * point, matching the pattern in sync-proposal-registry-race.spec.ts
 * and agent-lock-engine.spec.ts ("serializes concurrent successful
 * claims").
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runTaskQueueAction,
	type IEnqueueResult,
	type ITaskQueuePaths,
} from '@delendai/proposals/lib/agents/task-queue-engine';
import type { IPersistentTaskQueue } from '@delendai/proposals/lib/agents/persistent-task-queue';

describe('runTaskQueueAction — concurrent enqueue (a00083 F30)', async () => {
	let dir = '';
	let paths: ITaskQueuePaths;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tq-concurrency-'));
		paths = {
			queuePath: join(dir, 'queue.json'),
			closedTasksPath: join(dir, 'closed.json'),
			lockPath: join(dir, 'agents.lock.json'),
			workspaceRoot: dir,
		};
		writeFileSync(paths.closedTasksPath, JSON.stringify([]));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('serializes N=8 concurrent enqueue calls under withFileMutex — no lost updates', async () => {
		const N = 8;
		const results = await Promise.all(
			Array.from({ length: N }, (_, i) =>
				runTaskQueueAction(
					{
						action: 'enqueue',
						params: {
							taskId: `concurrent-task-${i}`,
							agentName: `agent-${i}`,
							agentSlot: 'orchestrator',
						},
					},
					paths,
				),
			),
		);

		// Every call must succeed — none should observe a torn intermediate
		// read of the queue file while another writer holds the mutex.
		const enqueued = results as IEnqueueResult[];
		expect(enqueued).toHaveLength(N);
		for (const r of enqueued) {
			expect(r.status).toBe('queued');
		}

		// The final persisted file must contain all N unique payloads — a lost
		// update (two writers reading the same base state, one clobbering the
		// other's write) would leave fewer than N entries on disk.
		const persisted = JSON.parse(
			readFileSync(paths.queuePath, 'utf8'),
		) as IPersistentTaskQueue;
		expect(persisted.entries).toHaveLength(N);
		const taskIds = new Set(persisted.entries.map((e) => e.taskId));
		expect(taskIds.size).toBe(N);
		for (let i = 0; i < N; i += 1) {
			expect(taskIds.has(`concurrent-task-${i}`)).toBe(true);
		}

		// Each result's own queueLength/position must be internally consistent
		// with SOME valid serialization order (position is a snapshot at the
		// moment that writer's turn ran, so lengths are non-decreasing overall
		// but not necessarily distinct or ordered by call order).
		const lengths = enqueued
			.map((r) => r.queueLength)
			.sort((a, b) => a - b);
		expect(lengths).toEqual(Array.from({ length: N }, (_, i) => i + 1));
	});
});
