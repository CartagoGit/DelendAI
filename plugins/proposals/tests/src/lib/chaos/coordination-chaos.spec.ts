import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAgentLockEngine,
	type ILockFile,
} from '@cartago-git/mcp-proposals/lib/locks/agent-lock-engine';
import {
	runTaskQueueMcp,
	type ITaskQueuePaths,
} from '@cartago-git/mcp-proposals/lib/agents/task-queue-engine';
import { runAgentNames } from '@cartago-git/mcp-proposals/lib/tools/agent-names.tool';

/**
 * N23 — chaos/adversarial. Stresses the reliability promise (atomic writes +
 * withFileMutex) under heavy contention: many "agents" hammering the same
 * lock / queue / registry at once. The invariants that must hold are no
 * lost updates, mutual exclusion per file, and never a torn (corrupt) file.
 */
describe('coordination chaos — heavy contention invariants (N23)', () => {
	let dir = '';
	let lockPath = '';
	let queuePath = '';
	let closedTasksPath = '';
	let registryPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'chaos-'));
		lockPath = join(dir, 'agents.lock.json');
		queuePath = join(dir, 'queue.json');
		closedTasksPath = join(dir, 'closed.json');
		registryPath = join(dir, 'registry.json');
		writeFileSync(closedTasksPath, JSON.stringify([]));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

	it('40 concurrent disjoint claims: no lost updates, valid file', async () => {
		const n = 40;
		await Promise.all(
			Array.from({ length: n }, (_, i) =>
				runAgentLockEngine(
					{
						action: 'claim',
						task_id: `t${i}`,
						agent: `a${i}`,
						files: [`src/f${i}.ts`],
					},
					{ lockPath }
				)
			)
		);
		const lock = readJson<ILockFile>(lockPath);
		expect(lock.in_flight).toHaveLength(n); // none lost
		expect(new Set(lock.in_flight.map((e) => e.task_id)).size).toBe(n);
	});

	it('20 concurrent claims for the SAME file: exactly one owner', async () => {
		const file = 'src/shared.ts';
		const results = await Promise.all(
			Array.from({ length: 20 }, (_, i) =>
				runAgentLockEngine(
					{ action: 'claim', task_id: `t${i}`, agent: `a${i}`, files: [file] },
					{ lockPath }
				)
			)
		);
		// File stays valid JSON, and exactly one entry owns the file.
		const lock = readJson<ILockFile>(lockPath);
		const owners = lock.in_flight.filter((e) => e.ownership.includes(file));
		expect(owners).toHaveLength(1);
		// Exactly one call reported a non-blocked claim for the file.
		const notBlocked = results.filter((r) => {
			const body = JSON.parse(
				(r.content as Array<{ text: string }>)[0]?.text ?? '{}'
			) as { blocked?: boolean };
			return body.blocked !== true;
		});
		expect(notBlocked).toHaveLength(1);
	});

	it('30 concurrent queue enqueues: all present, file never torn', async () => {
		const paths: ITaskQueuePaths = { queuePath, closedTasksPath, lockPath };
		const n = 30;
		await Promise.all(
			Array.from({ length: n }, (_, i) =>
				runTaskQueueMcp(
					{
						action: 'enqueue',
						params: { taskId: `q${i}`, agentName: 'a', agentSlot: 'orchestrator' },
					},
					paths
				)
			)
		);
		const queue = readJson<{ entries: Array<{ taskId: string }> }>(queuePath);
		expect(queue.entries).toHaveLength(n);
		expect(new Set(queue.entries.map((e) => e.taskId)).size).toBe(n);
	});

	it('25 concurrent registry assigns: no lost updates', async () => {
		const pool = Array.from({ length: 30 }, (_, i) => `name${i}`);
		const options = {
			namespacePrefix: 'proposals',
			registryPathAbs: registryPath,
			lockPathAbs: lockPath,
			queuePathAbs: queuePath,
			closedTasksPathAbs: closedTasksPath,
			pool,
		};
		const n = 25;
		await Promise.all(
			Array.from({ length: n }, (_, i) =>
				runAgentNames(
					{ action: 'assign', task_id: `task${i}`, agent_slot: 'implementation_runner' },
					options
				)
			)
		);
		const reg = readJson<{ assignments: Array<{ task_id: string }> }>(
			registryPath
		);
		expect(reg.assignments).toHaveLength(n);
		expect(new Set(reg.assignments.map((a) => a.task_id)).size).toBe(n);
	});
});
