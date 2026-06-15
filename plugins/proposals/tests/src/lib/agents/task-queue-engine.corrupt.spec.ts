/**
 * task-queue-engine.corrupt.spec.ts
 *
 * M10: corrupt ≠ empty. `loadOrEmptyQueue` (the read path behind
 * enqueue/dequeue/report) must refuse to treat a torn queue.json as an
 * empty queue — otherwise an enqueue would silently overwrite the
 * surviving entries. It quarantines the bytes and surfaces a structured
 * error through `runTaskQueueMcp`.
 */

import {
	existsSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runTaskQueueMcp,
	type ITaskQueuePaths,
} from '@cartago-git/mcp-proposals/lib/agents/task-queue-engine';

describe('task-queue engine — corrupt queue (M10)', () => {
	let dir = '';
	let paths: ITaskQueuePaths;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tq-corrupt-'));
		paths = {
			queuePath: join(dir, 'queue.json'),
			closedTasksPath: join(dir, 'closed.json'),
			lockPath: join(dir, 'agents.lock.json'),
		};
		writeFileSync(paths.closedTasksPath, JSON.stringify([]));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const backupExists = (): boolean =>
		readdirSync(dir).some((f) => f.startsWith('queue.json.corrupt-'));

	const body = (res: { content: Array<{ text: string }> }): { error?: string } =>
		JSON.parse(res.content[0]?.text ?? '{}');

	it('enqueue surfaces a structured error and preserves the corrupt bytes', async () => {
		writeFileSync(paths.queuePath, '{ "version": 1, "entries":');
		const res = await runTaskQueueMcp(
			{
				action: 'enqueue',
				params: {
					taskId: 't1',
					agentName: 'a',
					agentSlot: 'orchestrator',
				},
			},
			paths
		);
		expect(res.isError).toBe(true);
		expect(body(res).error).toContain('corrupt');
		expect(existsSync(paths.queuePath)).toBe(false);
		expect(backupExists()).toBe(true);
	});

	it('report (read-only) also refuses a corrupt queue', async () => {
		writeFileSync(paths.queuePath, 'not json at all');
		const res = await runTaskQueueMcp({ action: 'report', params: {} }, paths);
		expect(res.isError).toBe(true);
		expect(body(res).error).toContain('corrupt');
	});

	it('recovers after the corrupt backup is moved aside', async () => {
		writeFileSync(paths.queuePath, 'broken');
		await runTaskQueueMcp({ action: 'report', params: {} }, paths); // quarantines
		const res = await runTaskQueueMcp(
			{
				action: 'enqueue',
				params: {
					taskId: 't-after',
					agentName: 'a',
					agentSlot: 'orchestrator',
				},
			},
			paths
		);
		expect(res.isError).toBeUndefined();
		expect(body(res)).toMatchObject({ taskId: 't-after', status: 'queued' });
	});
});
