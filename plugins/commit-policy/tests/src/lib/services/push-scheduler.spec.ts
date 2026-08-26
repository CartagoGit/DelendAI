/**
 * push-scheduler.spec.ts — covers x00266 (AUD-CP-008/009) push
 * orchestration: onCommit, everyNCommits, everyNMinutes, branch
 * protection, and dispose idempotency.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import type { ICommitPolicyPush } from '@mcp-vertex/commit-policy/lib/contracts/options';
import { createPushScheduler } from '@mcp-vertex/commit-policy/lib/services/push-scheduler';

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
	protectedBranches: ['main', 'master', 'develop'],
	...overrides,
});

describe('push scheduler (x00266)', () => {
	it('does not push when no mode is enabled', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy(),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect(await scheduler.onCommitSucceeded()).toBeNull();
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

	it('fires ONE push when onCommit + everyNCommits both trigger', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('feature/x', ok('pushed\n')),
			policy: basePushPolicy({ onCommit: true, everyNCommits: 1 }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect((await scheduler.onCommitSucceeded())?.ok).toBe(true);
		expect(pushCount.n).toBe(1);
	});

	it('refuses pushes on a protected branch', async () => {
		const pushCount = { n: 0 };
		const scheduler = createPushScheduler({
			run: buildRunner('develop', fail('push refused')),
			policy: basePushPolicy({ onCommit: true }),
			onAttempt: () => {
				pushCount.n += 1;
			},
		});
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect(pushCount.n).toBe(0);
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
		expect(await scheduler.onCommitSucceeded()).toBeNull();
		expect(pushCount.n).toBe(0);
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
});
