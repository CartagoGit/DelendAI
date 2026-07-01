import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { promoteOnRelease } from '@mcp-vertex/proposals/lib/agents/promote-on-release';
import type { IPersistentTaskQueue } from '@mcp-vertex/proposals/lib/agents/persistent-task-queue';

const TEMP_DIRS: string[] = [];

const createTempDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'mcp-vertex-por-'));
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

describe('promoteOnRelease', () => {
	it('promotes queued tasks when their wait-for files are released', async () => {
		const queuePath = join(workDir, 'queue.json');
		const closedTasksPath = join(workDir, 'closed-tasks.json');
		writeFileSync(closedTasksPath, JSON.stringify([]), 'utf8');

		const queue: IPersistentTaskQueue = {
			version: 1,
			entries: [
				{
					taskId: 'task-1',
					enqueuedAt: '2026-06-05T10:00:00.000Z',
					priority: 3,
					waitFor: [{ file: 'foo.ts', releasedBy: null }],
					owner: {
						taskId: 'p40c-t1',
						agentName: 'observation_tower',
						agentSlot: 'proposal_guardian',
					},
					observe: [],
					status: 'queued',
				},
			],
		};
		writeFileSync(queuePath, JSON.stringify(queue), 'utf8');

		const result = await promoteOnRelease({
			queuePath,
			closedTasksPath,
			releasedFiles: ['foo.ts'],
		});

		expect(result.promotedCount).toBe(1);
		expect(result.promotedTaskIds).toEqual(['task-1']);
	});

	it('serializes concurrent promotions using withFileMutex', async () => {
		const queuePath = join(workDir, 'queue.json');
		const closedTasksPath = join(workDir, 'closed-tasks.json');
		writeFileSync(closedTasksPath, JSON.stringify([]), 'utf8');

		const queue: IPersistentTaskQueue = {
			version: 1,
			entries: [
				{
					taskId: 'task-1',
					enqueuedAt: '2026-06-05T10:00:00.000Z',
					priority: 3,
					waitFor: [{ file: 'foo.ts', releasedBy: null }],
					owner: {
						taskId: 'p40c-t1',
						agentName: 'observation_tower',
						agentSlot: 'proposal_guardian',
					},
					observe: [],
					status: 'queued',
				},
			],
		};
		writeFileSync(queuePath, JSON.stringify(queue), 'utf8');

		// Run two concurrent promotion requests. Since withFileMutex locks the file,
		// they should serialize and the second one should result in 0 promotions.
		const [r1, r2] = await Promise.all([
			promoteOnRelease({
				queuePath,
				closedTasksPath,
				releasedFiles: ['foo.ts'],
			}),
			promoteOnRelease({
				queuePath,
				closedTasksPath,
				releasedFiles: ['foo.ts'],
			}),
		]);

		expect(r1.promotedCount + r2.promotedCount).toBe(1);
	});
});
