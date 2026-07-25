import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	noteFileLockContention,
	resolveFileLockContentions,
} from '../../../../src/lib/locks/file-lock-table';
import { detectContention } from '../../../../src/lib/locks/contention-detector';

describe('detectContention', () => {
	let dir = '';
	let lockPath = '';
	let tablePath = '';

	beforeEach(() => {
		const root = join(process.cwd(), '.verify-tmp');
		mkdirSync(root, { recursive: true });
		dir = mkdtempSync(join(root, 'contention-detector-'));
		lockPath = join(dir, '.cache/agents.lock.json');
		tablePath = join(dir, '.cache/file-locks.json');
		mkdirSync(dirname(lockPath), { recursive: true });
		writeFileSync(
			lockPath,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [],
			}),
		);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('reports a disjoint livelock from recent contention history', async () => {
		await noteFileLockContention({
			kind: 'disjoint',
			waitingTaskId: 'task-b',
			waitingAgentId: 'agent-b',
			holderTaskId: 'task-a',
			holderAgentId: 'agent-a',
			files: ['src/disjoint.ts'],
			tablePath,
			now: () => '2026-07-25T10:00:00.000Z',
		});

		const detected = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
			now: () => new Date('2026-07-25T10:00:06.000Z').getTime(),
		});

		expect(detected.livelocks).toEqual([
			{
				agentA: 'agent-a',
				agentB: 'agent-b',
				files: ['src/disjoint.ts'],
				heldMs: 6_000,
			},
		]);
	});

	it('drops resolved contention once it is outside the 60s sweep window', async () => {
		await noteFileLockContention({
			kind: 'disjoint',
			waitingTaskId: 'task-b',
			waitingAgentId: 'agent-b',
			holderTaskId: 'task-a',
			holderAgentId: 'agent-a',
			files: ['src/disjoint.ts'],
			tablePath,
			now: () => '2026-07-25T10:00:00.000Z',
		});
		await noteFileLockContention({
			kind: 'disjoint',
			waitingTaskId: 'task-b',
			waitingAgentId: 'agent-b',
			holderTaskId: 'task-a',
			holderAgentId: 'agent-a',
			files: ['src/disjoint.ts'],
			tablePath,
			now: () => '2026-07-25T10:00:02.000Z',
		});
		await resolveFileLockContentions({
			waitingTaskId: 'task-b',
			tablePath,
			now: () => '2026-07-25T10:00:08.000Z',
		});

		const detected = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
			now: () => new Date('2026-07-25T10:01:11.000Z').getTime(),
		});

		expect(detected.livelocks).toEqual([]);
	});
});
