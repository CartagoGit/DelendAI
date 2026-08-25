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
import { runPushDriver } from '../../../src/lib/services/push-driver';

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
		await execFileAsync('git', ['init', '-q', '--bare'], { cwd: remote });
		await git(workspace, 'remote', 'add', 'origin', remote);
		await git(workspace, 'push', '-q', '-u', 'origin', 'develop');

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
				branch: 'develop',
			},
		});

		await writeFile(
			join(workspace, 'feature.ts'),
			'export const x = 1;\n',
			'utf8',
		);

		const commitResult = await runCommitDriver(
			{
				message: 'feat(commit-policy): dogfood smoke',
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

		const pushResult = await runPushDriver({}, policy.push, runner);
		expect(pushResult.ok).toBe(true);

		const remoteLog = await git(remote, 'log', '--oneline');
		expect(remoteLog.stdout).toContain('feat(f00181): dogfood smoke');
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
		const result = await runPushDriver({}, policy.push, runner);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('protectedBranches');
	});
});
