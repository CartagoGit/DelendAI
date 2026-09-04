import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withFileMutex } from '@delendai/core/public';
import { runAgentLockEngine } from '@delendai/proposals/lib/locks/agent-lock-engine';
import { tryAcquireFileLocks } from '@delendai/proposals/lib/locks/file-lock-table';
import {
	buildStateHealthRegistration,
	type IStateToolOptions,
} from '@delendai/proposals/lib/tools/state-tools.tool';

import { verifyTmpRoot } from './verify-tmp-root';

/**
 * Canonical test scratch location: the cache root the repo declares
 * exactly once (single source of truth in `DEFAULT_CORE_PATHS.cacheDir`,
 * enforced by `tools/scripts/lint/check-cache.script.ts`). The actual
 * root resolution happens in `verify-tmp-root.ts` so this path is
 * stable across cwd / worktree / hoisted-checkout invocations —
 * pinning it to `process.cwd()` here would leak a `.cache/` inside
 * every agent worktree the swarm spawns.
 */
const makeVerifyTmpDir = (prefix: string): string =>
	mkdtempSync(join(verifyTmpRoot(), prefix));

const body = (res: { content: Array<{ text: string }> }) =>
	JSON.parse(res.content[0]?.text ?? '{}') as {
		blockerType?: string;
		conflicting_task?: string;
		healthy?: boolean;
		locks?: unknown;
		[key: string]: unknown;
	};

const sleep = async (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

type ToolContent = { content: Array<{ text: string }> };
const capture = async (
	options: IStateToolOptions,
): Promise<(args: unknown) => Promise<ToolContent>> => {
	let handler: ((args: unknown) => Promise<ToolContent>) | undefined;
	await buildStateHealthRegistration(options).register({
		registerTool: (
			_name: string,
			_schema: unknown,
			fn: (args: unknown) => Promise<ToolContent>,
		) => {
			handler = fn;
		},
	} as never);
	if (handler === undefined) {
		throw new Error('state_health handler was not registered');
	}
	return handler;
};

describe('agent-lock file-level granularity', () => {
	let dir = '';
	let lockPath = '';
	let fileLockTablePath = '';
	let stateOptions: IStateToolOptions;

	beforeEach(() => {
		dir = makeVerifyTmpDir('agent-lock-granularity-');
		lockPath = join(dir, '.cache/agents.lock.json');
		fileLockTablePath = join(dir, '.cache/file-locks.json');
		stateOptions = {
			namespacePrefix: 'proposals',
			lockPathAbs: lockPath,
			queuePathAbs: join(dir, '.cache/agent-queue/queue.json'),
			closedTasksPathAbs: join(
				dir,
				'.cache/agent-queue/closed-tasks.json',
			),
			registryPathAbs: join(dir, '.cache/agent-registry.json'),
			fileLockTablePathAbs: fileLockTablePath,
			workspaceRoot: dir,
		};
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('lets disjoint claims through without contention within the lock budget', async () => {
		const started = Date.now();
		const [left, right] = await Promise.all([
			runAgentLockEngine(
				{
					action: 'claim',
					task_id: 'task-a',
					agent: 'agent-a',
					files: ['src/a.ts'],
				},
				{
					lockPath,
					fileLockTablePath,
					mutexTimeoutMs: 500,
					mutexStaleMs: 5_000,
					mutexPollMs: 5,
				},
			),
			runAgentLockEngine(
				{
					action: 'claim',
					task_id: 'task-b',
					agent: 'agent-b',
					files: ['src/b.ts'],
				},
				{
					lockPath,
					fileLockTablePath,
					mutexTimeoutMs: 500,
					mutexStaleMs: 5_000,
					mutexPollMs: 5,
				},
			),
		]);
		const elapsed = Date.now() - started;

		expect(body(left).blocked).not.toBe(true);
		expect(body(right).blocked).not.toBe(true);
		expect(elapsed).toBeLessThan(700);
	});

	it('keeps overlapping claims on the normal contention path and the second waits for the critical section', async () => {
		await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-a',
				agent: 'agent-a',
				files: ['src/shared.ts'],
			},
			{
				lockPath,
				fileLockTablePath,
				mutexTimeoutMs: 500,
				mutexStaleMs: 5_000,
				mutexPollMs: 5,
			},
		);

		const holder = withFileMutex(
			lockPath,
			async () => {
				await sleep(120);
			},
			{ timeoutMs: 500, staleMs: 1_000, pollMs: 10 },
		);

		const started = Date.now();
		const second = runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-b',
				agent: 'agent-b',
				files: ['src/shared.ts'],
			},
			{
				lockPath,
				fileLockTablePath,
				mutexTimeoutMs: 500,
				mutexStaleMs: 5_000,
				mutexPollMs: 10,
			},
		);
		const [secondResult] = await Promise.all([second, holder]);
		const elapsed = Date.now() - started;

		expect(elapsed).toBeGreaterThanOrEqual(100);
		expect(body(secondResult).blockerType).toBe('lock-conflict');
		expect(body(secondResult).conflicting_task).toBe('task-a');
	});

	it('state_health reports livelock once disjoint contention exceeds the heartbeat × 2', async () => {
		// f00154 S2 audit: the LIVELOCK_THRESHOLD used to be a hardcoded
		// 5s, shorter than withFileMutex's default heartbeatMs (10s).
		// Now the threshold is derived from `mutexStaleMs` so it scales
		// with the heartbeat the holder is actually refreshing. With
		// `mutexStaleMs: 2_500` here, `heartbeat = 833`, threshold ≈
		// 1_666; a 6-second held lock exceeds that.
		const startedAt = new Date(Date.now() - 6_000).toISOString();
		await tryAcquireFileLocks({
			agentId: 'agent-a',
			taskId: 'task-a',
			files: ['src/shared.ts'],
			tablePath: fileLockTablePath,
			now: () => startedAt,
		});

		const firstBlocked = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-b',
				agent: 'agent-b',
				files: ['src/shared.ts'],
			},
			{
				lockPath,
				fileLockTablePath,
				mutexStaleMs: 2_500,
				now: () => startedAt,
			},
		);
		expect(body(firstBlocked).blockerType).toBe('lock-conflict');

		const escalatedAt = new Date(Date.now()).toISOString();
		const livelock = await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'task-b',
				agent: 'agent-b',
				files: ['src/shared.ts'],
			},
			{
				lockPath,
				fileLockTablePath,
				mutexStaleMs: 2_500,
				now: () => escalatedAt,
			},
		);
		expect(livelock.isError).toBe(true);
		expect(body(livelock).blockerType).toBe('livelock-error');

		const handler = await capture(stateOptions);
		const health = body(await handler({}));
		expect(health.healthy).toBe(false);
		const locks = health.locks as {
			livelocks: number;
			livelockPairs: Array<{
				agentA: string;
				agentB: string;
				files: string[];
				heldMs: number;
			}>;
		};
		expect(locks.livelocks).toBe(1);
		expect(locks.livelockPairs).toEqual([
			expect.objectContaining({
				agentA: 'agent-a',
				agentB: 'agent-b',
				files: ['src/shared.ts'],
			}),
		]);
		expect(locks.livelockPairs[0]?.heldMs).toBeGreaterThanOrEqual(6_000);
	});
});
