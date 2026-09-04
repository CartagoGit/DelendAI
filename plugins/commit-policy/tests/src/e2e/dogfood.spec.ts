/**
 * tests/src/e2e/dogfood.spec.ts — end-to-end smoke for the
 * commit-policy engine.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
import { runCommitDriver } from '../../../src/lib/services/commit-driver';
import { runPushDriver } from '../../../src/lib/services/push-driver';
import { createPushScheduler } from '../../../src/lib/services/push-scheduler';
import {
	cleanupDogfoodRepo,
	createDogfoodRepo,
	git,
} from './_fixtures/dogfood-repo';

describe('commit-policy dogfood E2E', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	beforeEach(async () => {
		({ workspace, remote, runner } = await createDogfoodRepo());
	});

	afterEach(async () => {
		await cleanupDogfoodRepo({ workspace, remote });
	});

	it('commits a slice with the global user, no audit trailer (f00500 default) + pushes it', async () => {
		// f00500: the engine's default `audit.trailer` flipped from
		// 'co-authored-by' to 'none'. This test pins the new default
		// end-to-end: the resulting commit message has no trailer at all.
		const policy = CommitPolicyOptionsSchema.parse({
			gitTimeoutMs: 60000,
			commit: { enabled: true },
			identity: { mode: 'global' },
			audit: {
				agentFormat: '${host}/${model}',
			},
			cadence: { triggers: [{ kind: 'slice' }], sliceScoping: false },
			push: {
				enabled: true,
				onCommit: true,
				force: 'with-lease',
				protectedBranches: ['main', 'master'],
				remote: 'origin',
				branch: 'topic/e2e-test',
			},
		});

		await writeFile(
			join(workspace, 'feature.ts'),
			'export const x = 1;\n',
			'utf8',
		);

		const scheduler = createPushScheduler({
			run: runner,
			policy: policy.push,
		});
		const commitResult = await runCommitDriver(
			{
				message: 'feat: dogfood smoke',
				files: ['feature.ts'],
				sliceContext: {
					proposalId: 'f00181',
					sliceId: 'E2E',
					files: ['feature.ts'],
				},
			},
			{
				run: runner,
				policy,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: {
						host: 'vscode-copilot',
						model: 'minimax-m3',
					},
				},
				auditAgent: { host: 'vscode-copilot', model: 'minimax-m3' },
			},
		);
		expect(commitResult.committed).toBe(true);
		expect(commitResult.resolvedAuthor?.displayName).toBe('Cartago');
		const pushResult = await scheduler.onCommitSucceeded();
		expect(pushResult?.ok).toBe(true);
		expect(commitResult.pushed).toBe(false);

		const log = await git(
			workspace,
			'log',
			'-1',
			'--pretty=format:%an|%s%n%b',
		);
		const subject = log.stdout.split('\n')[0] ?? '';
		expect(subject).toContain('Cartago');
		expect(subject).toContain('feat(f00181): dogfood smoke');
		// f00500 default: the message body must NOT contain a Co-authored-by
		// trailer (or any other audit trailer) toward the agent host/model.
		expect(log.stdout).not.toMatch(/^co-authored-by:/im);
		expect(log.stdout).not.toMatch(/^signed-off-by:/im);

		// The bare remote keeps `develop` as HEAD, so inspect the exact sibling
		// ref that was pushed instead of the remote's default branch history.
		const remoteLog = await git(
			remote,
			'log',
			'topic/e2e-test',
			'--oneline',
		);
		expect(remoteLog.stdout).toContain('feat(f00181): dogfood smoke');

		// The push didn't just succeed — the remote's `topic/e2e-test` ref
		// itself now points at the exact commit the local branch produced.
		const localHead = await git(workspace, 'rev-parse', 'topic/e2e-test');
		const remoteHead = await git(remote, 'rev-parse', 'topic/e2e-test');
		expect(remoteHead.stdout.trim()).toBe(localHead.stdout.trim());
	});

	// t00031 S2 — the full dogfood path (a real commit via
	// `runCommitDriver`, audit trailer included) followed by a direct
	// push attempt to a branch the policy protects. `develop` is opt-in
	// protected here (see "permits configured push to develop" above for
	// the un-protected default) so the refusal under test is
	// `protectedBranches`-driven, not the hard-coded `main` guard that
	// `refuses to push to a protected branch even with onCommit=true`
	// already covers below.
	it('commits the full dogfood path, then refuses a direct push to develop when develop is protected', async () => {
		const policy = CommitPolicyOptionsSchema.parse({
			gitTimeoutMs: 60000,
			commit: { enabled: true },
			identity: { mode: 'global' },
			audit: {
				trailer: 'co-authored-by',
				agentFormat: '${host}/${model}',
			},
			cadence: { triggers: [{ kind: 'slice' }], sliceScoping: false },
			push: {
				enabled: true,
				onCommit: false,
				force: 'with-lease',
				protectedBranches: ['main', 'master', 'develop'],
				remote: 'origin',
				branch: 'develop',
			},
		});

		await writeFile(
			join(workspace, 'guarded.ts'),
			'export const guarded = 1;\n',
			'utf8',
		);

		const commitResult = await runCommitDriver(
			{
				message: 'feat: dogfood guarded push',
				files: ['guarded.ts'],
				sliceContext: {
					proposalId: 'f00181',
					sliceId: 'E2E-GUARD',
					files: ['guarded.ts'],
				},
			},
			{
				run: runner,
				policy,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: {
						host: 'vscode-copilot',
						model: 'minimax-m3',
					},
				},
				auditAgent: { host: 'vscode-copilot', model: 'minimax-m3' },
			},
		);
		expect(commitResult.committed).toBe(true);

		// The commit lands on the checked-out local branch
		// (`topic/e2e-test`, from `beforeEach`) — the engine never
		// commits directly to a protected branch. The rejection under
		// test is the separate, deliberate push attempt to `develop`,
		// exercising the full commit -> push refusal path instead of an
		// isolated `runPushDriver` call against no real commit history.
		const pushResult = await runPushDriver({}, policy.push, runner);
		expect(pushResult.ok).toBe(false);
		if (pushResult.ok) return;
		expect(pushResult.code).toBe('BRANCH_PROTECTED');
		expect(pushResult.refusal).toContain('develop');

		// The commit is real and present locally, but the guard fired
		// before any `git push` — the remote never saw it.
		const remoteBranches = await git(remote, 'branch', '-a');
		expect(remoteBranches.stdout).not.toContain('topic/e2e-test');
	});

	it('reports protected branch and detached HEAD as failed persistence', async () => {
		const protectedScheduler = createPushScheduler({
			run: runner,
			policy: CommitPolicyOptionsSchema.parse({
				push: {
					enabled: true,
					onCommit: true,
					protectedBranches: ['main'],
				},
			}).push,
		});
		await git(workspace, 'checkout', '-q', '-b', 'main');
		const protectedResult = await protectedScheduler.onCommitSucceeded();
		expect(protectedResult?.ok).toBe(false);
		if (protectedResult?.ok === false)
			expect(protectedResult.refusal).toContain('BRANCH_PROTECTED');

		await git(workspace, 'checkout', '-q', '--detach');
		const detachedScheduler = createPushScheduler({
			run: runner,
			policy: CommitPolicyOptionsSchema.parse({
				push: { enabled: true, onCommit: true },
			}).push,
		});
		const detachedResult = await detachedScheduler.onCommitSucceeded();
		expect(detachedResult?.ok).toBe(false);
		if (detachedResult?.ok === false)
			expect(detachedResult.refusal).toContain('detached');
	});

	it('permits configured push to develop when develop is not protected', async () => {
		await git(workspace, 'checkout', '-q', 'develop');
		const result = await createPushScheduler({
			run: runner,
			policy: CommitPolicyOptionsSchema.parse({
				push: {
					enabled: true,
					onCommit: true,
					force: 'with-lease',
					protectedBranches: ['main', 'master'],
					remote: 'origin',
					branch: 'develop',
				},
			}).push,
		}).pushNow();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.branch).toBe('develop');
	});

	it('refuses a commit when commit.enabled is false', async () => {
		const policy = CommitPolicyOptionsSchema.parse({});
		await writeFile(
			join(workspace, 'no-go.ts'),
			'export const x = 1;\n',
			'utf8',
		);
		const result = await runCommitDriver(
			{
				message: 'feat: nope',
				files: ['no-go.ts'],
			},
			{
				run: runner,
				policy,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(false);
		expect(result.refusal).toContain('commit.enabled');
	});
});
