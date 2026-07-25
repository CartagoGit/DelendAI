import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	listRecentFileLockContentions,
	noteFileLockContention,
	readFileLockTable,
	releaseFileLocks,
	resolveFileLockContentions,
	tryAcquireFileLocks,
} from '../../../../src/lib/locks/file-lock-table';

const makeVerifyTmpDir = (prefix: string): string => {
	const root = join(process.cwd(), '.verify-tmp');
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
});
