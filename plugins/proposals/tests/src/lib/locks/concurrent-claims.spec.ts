import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAgentLockEngine,
	type ILockFile,
} from '@cartago-git/mcp-proposals/lib/locks/agent-lock-engine';

/**
 * F4: the agent-lock engine runs its read → mutate → write under a file
 * mutex, so two agents claiming disjoint files at the same time can't
 * lose each other's claim (the classic last-writer-wins corruption).
 */
describe('agent-lock — concurrent disjoint claims (mutex)', () => {
	let dir = '';
	let lockPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'locks-'));
		lockPath = join(dir, '.cache/agents.lock.json');
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('keeps both claims when fired concurrently', async () => {
		const claim = (taskId: string, file: string): Promise<unknown> =>
			runAgentLockEngine(
				{ action: 'claim', task_id: taskId, agent: taskId, files: [file] },
				{ lockPath }
			);

		await Promise.all([
			claim('t1', 'src/a.ts'),
			claim('t2', 'src/b.ts'),
			claim('t3', 'src/c.ts'),
		]);

		const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as ILockFile;
		expect(lock.in_flight.map((e) => e.task_id).sort()).toEqual([
			't1',
			't2',
			't3',
		]);
	});
});
