/**
 * tests/src/e2e/dogfood.spec.ts — end-to-end smoke for the
 * commit-policy engine.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner } from '@mcp-vertex/core/public';
import type { IGitRunner } from '@mcp-vertex/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
import { runCommitDriver } from '../../../src/lib/services/commit-driver';
import { createPushScheduler } from '../../../src/lib/services/push-scheduler';

const execFileAsync = promisify(execFile);
const git = (cwd: string, ...args: readonly string[]) =>
	execFileAsync('git', [...args], { cwd });

describe('commit-policy dogfood E2E', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'commit-policy-dogfood-'));
		remote = await mkdtemp(join(tmpdir(), 'commit-policy-remote-'));
		await git(workspace, 'init', '-q', '-b', 'develop');
		await git(workspace, 'config', 'user.email', 'cartago@example.com');
		await git(workspace, 'config', 'user.name', 'Cartago');
		await git(
			workspace,
			'config',
			'--global',
			'user.email',
			'cartago@example.com',
		);
		await git(workspace, 'config', '--global', 'user.name', 'Cartago');
		await writeFile(join(workspace, 'README.md'), '# init\n', 'utf8');
		await git(workspace, 'add', '.');
		await git(workspace, 'commit', '-q', '-m', 'chore: init');
		await execFileAsync(
			'git',
			['init', '-q', '--bare', '--initial-branch=develop'],
			{ cwd: remote },
		).catch(async () => {
			await execFileAsync('git', ['init', '-q', '--bare'], {
				cwd: remote,
			});
			await execFileAsync(
				'git',
				['symbolic-ref', 'HEAD', 'refs/heads/develop'],
				{ cwd: remote },
			);
		});
		await git(workspace, 'remote', 'add', 'origin', remote);
		await git(workspace, 'push', '-q', '-u', 'origin', 'develop');
		await git(workspace, 'checkout', '-q', '-b', 'topic/e2e-test');

		runner = createWriteGitRunner(workspace);
	});

	afterEach(async () => {
		if (workspace.length > 0) {
			await rm(workspace, { recursive: true, force: true });
		}
		if (remote.length > 0) {
			await rm(remote, { recursive: true, force: true });
		}
	});

	it('commits a slice with the global user + audit trailer + pushes it', async () => {
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
		expect(log.stdout).toContain(
			'Co-authored-by: vscode-copilot/minimax-m3',
		);

		// `--all`: the bare remote's default branch is still `develop` (set
		// up in beforeEach), so a plain `log` walks only that ref and would
		// never see a commit pushed to the sibling `topic/e2e-test` branch.
		const remoteLog = await git(remote, 'log', '--oneline', '--all');
		expect(remoteLog.stdout).toContain('feat(f00181): dogfood smoke');

		// The push didn't just succeed — the remote's `topic/e2e-test` ref
		// itself now points at the exact commit the local branch produced.
		const localHead = await git(workspace, 'rev-parse', 'topic/e2e-test');
		const remoteHead = await git(remote, 'rev-parse', 'topic/e2e-test');
		expect(remoteHead.stdout.trim()).toBe(localHead.stdout.trim());
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

	it('refuses to push to a protected branch even with onCommit=true', async () => {
		await git(workspace, 'checkout', '-q', '-b', 'main');
		await git(workspace, 'push', '-q', '-u', 'origin', 'main');
		const policy = CommitPolicyOptionsSchema.parse({
			commit: { enabled: true },
			identity: { mode: 'global' },
			cadence: { triggers: [], sliceScoping: false },
			push: {
				enabled: true,
				onCommit: true,
				force: 'with-lease',
				protectedBranches: ['main', 'master'],
				remote: 'origin',
				branch: 'main',
			},
		});
		const result = await createPushScheduler({
			run: runner,
			policy: policy.push,
		}).pushNow();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('BRANCH_PROTECTED');
	});
});
