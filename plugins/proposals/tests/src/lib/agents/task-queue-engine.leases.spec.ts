/**
 * task-queue-engine.leases.spec.ts — a task survives the worker that
 * took it, is delivered to one worker at a time, and the queue does not
 * grow without bound.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendToClosedTasks } from '@delendai/proposals/lib/agents/closed-tasks-log';
import {
	runTaskQueueAction,
	runTaskQueueMcp,
	TaskQueueActionError,
	type ITaskQueuePaths,
} from '@delendai/proposals/lib/agents/task-queue-engine';

const START = Date.parse('2026-10-24T12:00:00.000Z');
const LEASE_MS = 60_000;

let dir = '';
let clock = START;
let paths: ITaskQueuePaths;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'tq-leases-'));
	clock = START;
	paths = {
		queuePath: join(dir, 'queue.json'),
		closedTasksPath: join(dir, 'closed.json'),
		lockPath: join(dir, 'agents.lock.json'),
		workspaceRoot: dir,
		leaseMs: LEASE_MS,
		maxLiveTasks: 2,
		now: () => clock,
	};
	writeFileSync(paths.closedTasksPath, JSON.stringify([]));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const enqueueTask = (taskId: string) =>
	runTaskQueueAction(
		{
			action: 'enqueue',
			params: {
				taskId,
				agentName: 'orchestrator',
				agentSlot: 'orchestrator',
			},
		},
		paths,
	);

const dequeueTask = (taskId: string) =>
	runTaskQueueAction({ action: 'dequeue', params: { taskId } }, paths);

describe('a task whose worker dies with it', () => {
	it('is delivered once to the next worker after the lease lapses, never twice', async () => {
		await enqueueTask('task-1');
		await dequeueTask('task-1'); // the first worker takes it, then dies

		// While its lease holds, nobody else is handed the task.
		await expect(dequeueTask('task-1')).rejects.toMatchObject({
			code: 'TASK_LEASED',
		});

		clock = START + LEASE_MS + 1;
		const second = await dequeueTask('task-1');
		expect(second).toMatchObject({ taskId: 'task-1', status: 'consumed' });

		// The next worker holds it now: a third is refused.
		await expect(dequeueTask('task-1')).rejects.toBeInstanceOf(
			TaskQueueActionError,
		);
	});

	it('is not reclaimed once it closed', async () => {
		await enqueueTask('task-1');
		await dequeueTask('task-1');
		await appendToClosedTasks(paths.closedTasksPath, {
			taskId: 'task-1',
			closedAt: '2026-10-24T12:00:30.000Z',
			agentName: 'orchestrator',
			filesOwned: [],
		});
		clock = START + LEASE_MS + 1;
		await expect(dequeueTask('task-1')).rejects.toThrow(/has closed/u);
	});
});

describe('a full queue', () => {
	it('refuses another task with a typed error, and takes a re-enqueue of one it holds', async () => {
		await enqueueTask('task-1');
		await enqueueTask('task-2');

		const refused = await runTaskQueueMcp(
			{
				action: 'enqueue',
				params: {
					taskId: 'task-3',
					agentName: 'orchestrator',
					agentSlot: 'orchestrator',
				},
			},
			paths,
		);
		expect(refused.isError).toBe(true);
		expect(refused.structuredContent).toMatchObject({ code: 'QUEUE_FULL' });

		await expect(enqueueTask('task-2')).resolves.toMatchObject({
			status: 'queued',
		});
	});
});
