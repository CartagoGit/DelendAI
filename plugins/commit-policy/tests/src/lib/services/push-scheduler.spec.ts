/**
 * push-scheduler.spec.ts — covers x00266 (AUD-CP-008/009) push
 * orchestration: onCommit, everyNCommits, everyNMinutes, branch
 * protection, and dispose idempotency.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import type { ICommitPolicyPush } from '@delendai/commit-policy/lib/contracts/options';
import { createPushScheduler } from '@delendai/commit-policy/lib/services/push-scheduler';

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (
	currentBranch: string | undefined,
	pushResult: IGitRunResult,
): IGitRunner => {
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
			return Promise.resolve(
				currentBranch === undefined
					? fail('not a repo')
					: ok(`${currentBranch}\n`),
			);
		}
		if (args[0] === 'push') return Promise.resolve(pushResult);
		return Promise.resolve(fail(`not stubbed: ${args.join(' ')}`));
	};
	return handler as IGitRunner;
};

const basePushPolicy = (
	overrides: Partial<ICommitPolicyPush> = {},
): ICommitPolicyPush => ({
	enabled: true,
	onCommit: false,
	force: 'with-lease',
	protectedBranches: ['main', 'master'],
	...overrides,
});

const waitForPushCount = async (
	getCount: () => number,
	wanted: number,
): Promise<void> => {
	const deadline = Date.now() + 2_000;
	while (getCount() < wanted) {
		if (Date.now() >= deadline)
			throw new Error(`timed out waiting for ${wanted} push attempt(s)`);
		await new Promise<void>((resolve) => setTimeout(resolve, 1));
	}
};

describe('push scheduler (x00266)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not push when no mode is enabled', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy(),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result).toBeNull();
		expect(pushCount.n).toBe(0);
	});

	it('pushes immediately when onCommit=true', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ onCommit: true }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result?.ok).toBe(true);
		expect(pushCount.n).toBe(1);
	});

	it('pushes only when the count crosses everyNCommits', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ everyNCommits: 3 }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect((await scheduler.onCommitSucceeded())?.ok).toBe(true);
		expect(pushCount.n).toBe(1);
	});

	it('resets the counter after a successful everyNCommits push', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ everyNCommits: 2 }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect((await scheduler.onCommitSucceeded())?.ok).toBe(true);
		expect(pushCount.n).toBe(1);
		// Counter reset; one more commit should not push yet.
		expect(await scheduler.onCommitSucceeded()).toBeNull();
	});

	it('suppresses onCommit until everyNCommits closes the window', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ onCommit: true, everyNCommits: 3 }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect((await scheduler.onCommitSucceeded())?.ok).toBe(true);
		expect(pushCount.n).toBe(1);
	});

	it('refuses pushes on a protected branch', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('develop', fail('push refused')),
			policy: basePushPolicy({
				onCommit: true,
				protectedBranches: ['main', 'master', 'develop'],
			}),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result?.ok).toBe(false);
		if (result?.ok === false)
			expect(result.refusal).toContain('BRANCH_PROTECTED');
		expect(pushCount.n).toBe(1);
	});

	it('pushes on develop when config omits develop from protectedBranches', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('develop', ok('pushed\n')),
			policy: basePushPolicy({
				onCommit: true,
				remote: 'origin',
				protectedBranches: ['main', 'master'],
			}),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result?.ok).toBe(true);
		if (result?.ok !== true) return;
		expect(result.branch).toBe('develop');
		expect(pushCount.n).toBe(1);
	});

	it('allows pushes on master when config omits it from protectedBranches', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('master', ok('pushed\n')),
			policy: basePushPolicy({
				onCommit: true,
				remote: 'origin',
				protectedBranches: [],
			}),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result?.ok).toBe(true);
		expect(pushCount.n).toBe(1);
	});

	it('does not push when HEAD is detached', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner(undefined, ok('pushed\n')),
			policy: basePushPolicy({ onCommit: true }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result?.ok).toBe(false);
		if (result?.ok === false) expect(result.refusal).toContain('detached');
		expect(pushCount.n).toBe(1);
	});

	it('propagates a push timeout/error without throwing', async () => {
		const scheduler = createPushScheduler({
			run: async (args) => {
				if (args[0] === 'rev-parse') return ok('feature/x\n');
				throw new Error('command timed out after 60000ms');
			},
			policy: basePushPolicy({ onCommit: true }),
		});
		const result = await scheduler.onCommitSucceeded();
		expect(result?.ok).toBe(false);
		if (result?.ok === false) expect(result.refusal).toContain('timed out');
	});

	it('stop() is idempotent and resets the counter', async () => {
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ everyNCommits: 2 }),
		});
		await scheduler.onCommitSucceeded();
		scheduler.stop();
		scheduler.stop();
		// After stop+reset the counter is 0, so the next commit
		// alone shouldn't push.
		expect(await scheduler.onCommitSucceeded()).toBeNull();
	});

	it('pushNow() pushes regardless of mode', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ onCommit: false }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect((await scheduler.pushNow()).ok).toBe(true);
		expect(pushCount.n).toBe(1);
	});

	it('start() does not start a timer when everyNMinutes is unset', () => {
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy(),
		});
		scheduler.start();
		scheduler.stop();
	});

	it('pushes once on everyNMinutes and stop() prevents later ticks', async () => {
		vi.useRealTimers();
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ everyNMinutes: 0.0001 }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});

		scheduler.start();
		expect(await scheduler.onCommitSucceeded()).toBeNull();

		await waitForPushCount(() => pushCount.n, 1);
		scheduler.stop();
		await scheduler.flush();
		expect(pushCount.n).toBe(1);

		await new Promise<void>((resolve) => setTimeout(resolve, 10));
		await scheduler.flush();
		expect(pushCount.n).toBe(1);
	});

	it('pushes existing unpushed commits after scheduler restart', async () => {
		vi.useRealTimers();
		const pushCount = { n: 0 };
		const run: IGitRunner = (async (args: readonly string[]) => {
			if (args[0] === 'rev-parse' && args.includes('--abbrev-ref'))
				return ok('feature/x\n');
			if (args[0] === 'rev-list') return ok('2\n');
			if (args[0] === 'push') {
				pushCount.n += 1;
				return ok('pushed\n');
			}
			return ok('');
		}) as IGitRunner;

		const scheduler = createPushScheduler({
			run,
			policy: basePushPolicy({ everyNMinutes: 0.0001 }),
		});
		scheduler.start();
		await waitForPushCount(() => pushCount.n, 1);
		scheduler.stop();
		await scheduler.flush();

		expect(pushCount.n).toBe(1);
	});

	it('serializes concurrent onCommitSucceeded calls', async () => {
		let activePushes = 0;
		let maxActivePushes = 0;
		const scheduler = createPushScheduler({
			run: (async (args: readonly string[]) => {
				if (args[0] === 'rev-parse') return ok('feature/x\n');
				if (args[0] === 'push') {
					activePushes += 1;
					maxActivePushes = Math.max(maxActivePushes, activePushes);
					await Promise.resolve();
					activePushes -= 1;
					return ok('pushed\n');
				}
				return ok('');
			}) as never,
			policy: { ...basePushPolicy(), onCommit: true },
		});

		await Promise.all([
			scheduler.onCommitSucceeded(),
			scheduler.onCommitSucceeded(),
		]);
		expect(maxActivePushes).toBe(1);
		scheduler.stop();
	});
});
