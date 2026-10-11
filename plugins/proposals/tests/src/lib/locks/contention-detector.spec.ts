import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectContention } from '../../../../src/lib/locks/contention-detector';
import {
	noteFileLockContention,
	resolveFileLockContentions,
} from '../../../../src/lib/locks/file-lock-table';

import { verifyTmpRoot } from './verify-tmp-root';

describe('detectContention', () => {
	let dir = '';
	let lockPath = '';
	let tablePath = '';

	beforeEach(() => {
		// Canonical scratch location: `verifyTmpRoot()` resolves the
		// repo root via `import.meta.url` (see ./verify-tmp-root.ts) so
		// the resulting `<repoRoot>/.cache/delendai/verify-tmp/<prefix>-XXXXXX/`
		// stays under the canonical cache even when the suite runs from
		// an agent worktree. Pinning this to `process.cwd()` here
		// would leak a `.cache/` inside every swarm worktree.
		dir = mkdtempSync(join(verifyTmpRoot(), 'contention-detector-'));
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

	it('does not report contention after it has been resolved', async () => {
		await noteFileLockContention({
			kind: 'disjoint',
			waitingTaskId: 'task-b',
			waitingAgentId: 'agent-b',
			holderTaskId: 'task-a',
			holderAgentId: 'agent-a',
			files: ['src/disjoint.ts'],
			now: () => '2026-07-25T10:00:00.000Z',
			tablePath,
		});
		await resolveFileLockContentions({
			waitingTaskId: 'task-b',
			tablePath,
			now: () => '2026-07-25T10:00:01.000Z',
		});

		const detected = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
			now: () => new Date('2026-07-25T10:00:02.000Z').getTime(),
		});

		expect(detected.livelocks).toEqual([]);
	});

	it('drops unresolved contention once it is inactive outside the 60s sweep window', async () => {
		await noteFileLockContention({
			kind: 'disjoint',
			waitingTaskId: 'task-b',
			waitingAgentId: 'agent-b',
			holderTaskId: 'task-a',
			holderAgentId: 'agent-a',
			files: ['src/disjoint.ts'],
			now: () => '2026-07-25T10:00:00.000Z',
			tablePath,
		});

		const detected = await detectContention({
			lockPath,
			fileLockTablePath: tablePath,
			now: () => new Date('2026-07-25T10:01:01.000Z').getTime(),
		});

		expect(detected.livelocks).toEqual([]);
	});
});
