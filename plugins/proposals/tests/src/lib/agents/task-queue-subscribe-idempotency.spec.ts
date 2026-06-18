/**
 * task-queue-subscribe-idempotency.spec.ts (M6)
 *
 * `subscribe` must be idempotent ACROSS sessions: the delivered (taskId,
 * observedTaskId) pairs are persisted in a `.subscribe-delivered.json`
 * sidecar next to the queue, mutated under withFileMutex. A process restart
 * (modelled here by the fact that the engine keeps no in-memory state) must
 * NOT re-deliver a digest that was already handed out.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runTaskQueueAction,
	type ISubscribeActionResult,
	type ITaskQueuePaths,
} from '@mcp-vertex/proposals/lib/agents/task-queue-engine';

const subscribe = (
	paths: ITaskQueuePaths,
	taskId: string
): Promise<ISubscribeActionResult> =>
	runTaskQueueAction({ action: 'subscribe', params: { taskId } }, paths) as Promise<ISubscribeActionResult>;

describe('subscribe idempotency persists across sessions (M6)', () => {
	let dir = '';
	let paths: ITaskQueuePaths;
	const sidecar = (): string => join(dir, '.subscribe-delivered.json');

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'tq-deliver-'));
		paths = {
			queuePath: join(dir, 'queue.json'),
			closedTasksPath: join(dir, 'closed.json'),
			lockPath: join(dir, 'agents.lock.json'),
			workspaceRoot: dir,
		};
		// dep1 is already closed; obs observes it.
		writeFileSync(
			paths.closedTasksPath,
			JSON.stringify([
				{
					taskId: 'dep1',
					closedAt: '2026-01-01T00:00:00Z',
					agentName: 'a',
					filesOwned: ['src/a.ts'],
				},
			])
		);
		await runTaskQueueAction(
			{
				action: 'enqueue',
				params: { taskId: 'obs', agentName: 'a', agentSlot: 'orchestrator', observe: ['dep1'] },
			},
			paths
		);
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('delivers a digest once, then never again (restart-safe)', async () => {
		const first = await subscribe(paths, 'obs');
		expect(first.digests.map((d) => d.taskId)).toEqual(['dep1']);
		expect(first.pendingTargets).toEqual([]);

		// The set is persisted — no in-memory carryover, so this models a restart.
		expect(existsSync(sidecar())).toBe(true);
		const persisted = JSON.parse(readFileSync(sidecar(), 'utf8')) as { delivered: string[] };
		expect(persisted.delivered).toContain('obs::dep1');

		const second = await subscribe(paths, 'obs');
		expect(second.digests).toEqual([]); // not re-delivered
		expect(second.pendingTargets).toEqual([]);
	});

	it('keys delivery per (observer, target): a different observer still gets its digest', async () => {
		// obs already observes dep1 (beforeEach). Add a second observer of dep1.
		await runTaskQueueAction(
			{
				action: 'enqueue',
				params: { taskId: 'obs2', agentName: 'a', agentSlot: 'orchestrator', observe: ['dep1'] },
			},
			paths
		);

		const first = await subscribe(paths, 'obs');
		expect(first.digests.map((d) => d.taskId)).toEqual(['dep1']);
		// A distinct observer is not blocked by obs's delivery — its key differs.
		const second = await subscribe(paths, 'obs2');
		expect(second.digests.map((d) => d.taskId)).toEqual(['dep1']);

		const persisted = JSON.parse(readFileSync(sidecar(), 'utf8')) as { delivered: string[] };
		expect(persisted.delivered).toEqual(['obs2::dep1', 'obs::dep1']); // sorted
	});
});
