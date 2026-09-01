/**
 * queue-races.spec.ts — concurrent RMW coverage for the task queue
 * (x00097 S2, audit a00052 #13).
 *
 * Two tool-level writers used to read-modify-write `queue.json` without
 * sharing the file mutex: the agent-names watchdog enqueue
 * (`emitQueueEvent`: parse → enqueue → persist) and the state-repair
 * expire sweep (parse → sweep → persist, which writes even when nothing
 * expired). Interleaved, one writer's persist silently clobbered the
 * other's entries — no corrupt JSON, just lost state. Both transactions
 * now run under `withFileMutex(queuePath)`; these tests hammer the real
 * tool surfaces concurrently and assert nothing is ever lost.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseQueue } from '@mcp-vertex/proposals/lib/agents/persistent-task-queue';
import {
	runAgentNames,
	type IAgentNamesToolOptions,
} from '@mcp-vertex/proposals/lib/tools/agent-names.tool';
import {
	buildStateRepairRegistration,
	type IStateToolOptions,
} from '@mcp-vertex/proposals/lib/tools/state-tools.tool';
import { createFakeToolServer } from '@mcp-vertex/test-kit/public';

const STALE_LAST_SEEN = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

/** A registry whose single adopted assignment is a stale zombie with
 *  a lock entry — R-2026-08-31: `gcZombies` only emits the watchdog
 *  event when the orphan actually held a lock, so the test fixtures
 *  must include a real lock entry for the reconcile path to fire
 *  `queueEmitter`. */
const zombieRegistry = (taskId: string): string =>
	JSON.stringify({
		version: 2,
		adopted: [{ name: 'vega', task_id: taskId }],
		assignments: [
			{
				task_id: taskId,
				agent_name: 'vega',
				agent_slot: 'implementation_runner',
				parent_task_id: null,
				depth: 0,
				topic: 'queue-race',
				adopted: true,
				assigned_at: STALE_LAST_SEEN,
				last_seen: STALE_LAST_SEEN,
				cooldown_until: null,
				status: 'active',
			},
		],
	});

/** A lock file with the matching taskId so the reconcile path
 *  actually frees a lock and triggers the watchdog event. */
const zombieLock = (taskId: string): string =>
	JSON.stringify({
		version: 1,
		stale_after_minutes: 10,
		in_flight: [
			{
				task_id: taskId,
				agent: 'vega',
				ownership: ['packages/proposals/src/queue-race.ts'],
				started_at: STALE_LAST_SEEN,
				last_seen: STALE_LAST_SEEN,
				host: 'dead-host',
				pid: 999999,
			},
		],
	});

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<IToolResult>;

/** Capture the state_repair handler off the real registration. */
const captureRepairHandler = async (
	options: IStateToolOptions,
): Promise<ToolHandler> => {
	let handler: ToolHandler | undefined;
	const server = createFakeToolServer({
		onRegisterTool: (call) => {
			handler = call.handler as ToolHandler;
		},
	});
	await buildStateRepairRegistration(options).register(server);
	if (handler === undefined) throw new Error('state_repair did not register');
	return handler;
};

describe('task-queue concurrent RMW (x00097 S2)', () => {
	let root: string;
	let queuePath: string;
	let closedTasksPath: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'queue-races-'));
		queuePath = join(root, 'queue.json');
		closedTasksPath = join(root, 'closed-tasks.json');
		writeFileSync(queuePath, JSON.stringify({ version: 1, entries: [] }));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const namesOptions = (
		registryPath: string,
		lockPath: string,
	): IAgentNamesToolOptions => ({
		namespacePrefix: 'proposals',
		registryPathAbs: registryPath,
		lockPathAbs: lockPath,
		queuePathAbs: queuePath,
		closedTasksPathAbs: closedTasksPath,
		workspaceRoot: root,
	});

	/** One reconcile = one force_release = one watchdog enqueue on the shared queue.
	 *  R-2026-08-31: the lock fixture MUST contain the matching taskId so the
	 *  `gcZombies` release actually fires `queueEmitter`. Each zombie
	 *  gets its own lock file under a unique name so the releases do
	 *  not race the same in_flight entry. */
	const reconcileZombie = (index: number): Promise<IToolResult> => {
		const registryPath = join(root, `registry-${index}.json`);
		const lockPath = join(root, `agent-lock-${index}.json`);
		writeFileSync(registryPath, zombieRegistry(`task-${index}`));
		writeFileSync(lockPath, zombieLock(`task-${index}`));
		return runAgentNames(
			{
				action: 'reconcile',
				dry_run: false,
				stale_after_minutes: 10,
				now: new Date().toISOString(),
			},
			namesOptions(registryPath, lockPath),
		);
	};

	it('N concurrent watchdog enqueues land N entries — none lost (barrier)', async () => {
		const N = 8;
		// Barrier: all transactions launched in the same tick, racing the
		// same queue file. Pre-mutex, most persists overwrote each other.
		await Promise.all(
			Array.from({ length: N }, (_, i) => reconcileZombie(i)),
		);

		const queue = await parseQueue(queuePath, closedTasksPath, root);
		const ids = queue.entries.map((e) => e.taskId).sort();
		expect(ids).toEqual(
			Array.from(
				{ length: N },
				(_, i) => `zombie-gc-event-task-${i}`,
			).sort(),
		);
	});

	it('the expire sweep racing concurrent enqueues clobbers nothing', async () => {
		const N = 6;
		const repair = await captureRepairHandler({
			namespacePrefix: 'proposals',
			lockPathAbs: join(root, 'agent-lock.json'),
			queuePathAbs: queuePath,
			closedTasksPathAbs: closedTasksPath,
			registryPathAbs: join(root, 'repair-registry.json'),
			workspaceRoot: root,
		});

		// Barrier: the sweep (an unconditional persist) fires in the middle
		// of N enqueue transactions on the same file.
		await Promise.all([
			...Array.from({ length: N }, (_, i) => reconcileZombie(i)),
			repair({ mode: 'execute' }),
		]);

		const queue = await parseQueue(queuePath, closedTasksPath, root);
		const ids = new Set(queue.entries.map((e) => e.taskId));
		for (let i = 0; i < N; i++) {
			expect(ids.has(`zombie-gc-event-task-${i}`)).toBe(true);
		}
	});

	it('serialized transactions keep the one-entry-per-taskId parser invariant', async () => {
		// The same zombie reconciled twice concurrently must not append a
		// duplicate taskId (parseQueue hard-fails on duplicates). Both
		// reconciles must share the same lock file so each one releases
		// the same taskId; the queue emitter fires once because the
		// second reconcile finds the lock already gone.
		const registryPath = join(root, 'registry-dup.json');
		const lockPath = join(root, 'agent-lock-dup.json');
		writeFileSync(registryPath, zombieRegistry('task-dup'));
		writeFileSync(lockPath, zombieLock('task-dup'));
		const args = {
			action: 'reconcile',
			dry_run: false,
			stale_after_minutes: 10,
			now: new Date().toISOString(),
		} as const;
		await Promise.all([
			runAgentNames(args, namesOptions(registryPath, lockPath)),
			runAgentNames(args, namesOptions(registryPath, lockPath)),
		]);

		// parseQueue itself enforces the invariant — it throws on duplicates.
		const queue = await parseQueue(queuePath, closedTasksPath, root);
		expect(
			queue.entries.filter(
				(e) => e.taskId === 'zombie-gc-event-task-dup',
			),
		).toHaveLength(1);
	});
});
