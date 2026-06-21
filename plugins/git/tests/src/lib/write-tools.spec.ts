/**
 * `git_commit` / `git_push` (S9, f00020). Runs against a TEMPORARY git
 * repo created with `git init` in a tmpdir — never touches the real
 * workspace `.git`. Pushes target a local bare "remote" repo so the test
 * stays fully offline.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	isConventionalCommitMessage,
	runGitCommit,
	runGitPush,
} from '@mcp-vertex/git/lib/write-tools';
import { createGitRunner } from '@mcp-vertex/git/lib/git';
import type { IGitRunner } from '@mcp-vertex/git/lib/git';

const execFileAsync = promisify(execFile);

/** Run a setup-only git command directly (not through the tool under test). */
const run = async (
	cmd: string,
	args: readonly string[],
	cwd: string,
): Promise<void> => {
	await execFileAsync(cmd, [...args], { cwd });
};

describe('git_commit / git_push (S9)', () => {
	let repoDir = '';
	let runner: IGitRunner;

	beforeEach(async () => {
		repoDir = await mkdtemp(join(tmpdir(), 'git-write-'));
		await run('git', ['init', '-q'], repoDir);
		await run(
			'git',
			['config', 'user.email', 'agent-a@example.com'],
			repoDir,
		);
		await run('git', ['config', 'user.name', 'agent-a'], repoDir);
		await writeFile(join(repoDir, 'README.md'), '# init\n', 'utf8');
		await run('git', ['add', '.'], repoDir);
		await run('git', ['commit', '-q', '-m', 'chore: init'], repoDir);
		runner = createGitRunner(repoDir);
	});

	afterEach(async () => rm(repoDir, { recursive: true, force: true }));

	it('isConventionalCommitMessage accepts the documented prefixes', () => {
		expect(isConventionalCommitMessage('feat: add x')).toBe(true);
		expect(isConventionalCommitMessage('fix(core): y')).toBe(true);
		expect(isConventionalCommitMessage('feat!: breaking')).toBe(true);
		expect(isConventionalCommitMessage('refactor(git): z')).toBe(true);
		expect(isConventionalCommitMessage('random message')).toBe(false);
		expect(isConventionalCommitMessage('Feat: wrong case')).toBe(false);
	});

	it('commits a simple change with a Conventional Commit message', async () => {
		await writeFile(join(repoDir, 'a.txt'), 'hello\n', 'utf8');
		const result = await runGitCommit(runner, {
			message: 'feat: add a.txt',
			files: ['a.txt'],
		});
		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			ok: boolean;
			committed: boolean;
			hash?: string;
		};
		expect(body.ok).toBe(true);
		expect(body.committed).toBe(true);
		expect(body.hash).toBeDefined();

		const log = await runner(['log', '-1', '--pretty=format:%s']);
		expect(log.output.trim()).toBe('feat: add a.txt');
	});

	it('commits a selective set of files via `files:`', async () => {
		await writeFile(join(repoDir, 'b1.txt'), 'one\n', 'utf8');
		await writeFile(join(repoDir, 'b2.txt'), 'two\n', 'utf8');
		const result = await runGitCommit(runner, {
			message: 'feat: add only b1',
			files: ['b1.txt'],
		});
		expect(
			(result.structuredContent as { committed: boolean }).committed,
		).toBe(true);

		const status = await runner(['status', '--porcelain=v1']);
		// b1.txt was committed (no longer untracked); b2.txt remains untracked.
		expect(status.output).not.toContain('b1.txt');
		expect(status.output).toContain('?? b2.txt');
	});

	it('amends the last commit when the last commit author matches the agent', async () => {
		await writeFile(join(repoDir, 'c.txt'), 'c\n', 'utf8');
		await runGitCommit(runner, {
			message: 'feat: add c.txt',
			files: ['c.txt'],
			agent: 'agent-a',
		});
		await writeFile(join(repoDir, 'c.txt'), 'c v2\n', 'utf8');
		const result = await runGitCommit(runner, {
			message: 'feat: add c.txt (amended)',
			files: ['c.txt'],
			amend: true,
			agent: 'agent-a',
		});
		expect(result.isError).toBeUndefined();
		const log = await runner(['log', '-1', '--pretty=format:%s']);
		expect(log.output.trim()).toBe('feat: add c.txt (amended)');
		// Still only one commit beyond the init commit (amend, not a new commit).
		const count = await runner(['rev-list', '--count', 'HEAD']);
		expect(count.output.trim()).toBe('2');
	});

	it('refuses --amend when the last commit author does not match the agent', async () => {
		await writeFile(join(repoDir, 'd.txt'), 'd\n', 'utf8');
		// Last commit (the init commit) was authored by "agent-a" too via the
		// beforeEach setup; simulate a DIFFERENT last-commit author so the
		// guard has something real to refuse.
		await run('git', ['config', 'user.name', 'agent-b'], repoDir);
		await run(
			'git',
			['config', 'user.email', 'agent-b@example.com'],
			repoDir,
		);
		await writeFile(join(repoDir, 'e.txt'), 'e\n', 'utf8');
		await run('git', ['add', 'e.txt'], repoDir);
		await run(
			'git',
			['commit', '-q', '-m', 'feat: agent-b commit'],
			repoDir,
		);

		const result = await runGitCommit(runner, {
			message: 'feat: trying to amend someone else',
			amend: true,
			agent: 'agent-a',
		});
		expect(result.isError).toBe(true);
		expect(
			(result.structuredContent as { error: { reason: string } }).error
				.reason,
		).toContain('refusing --amend');
	});

	it('rejects an empty commit message', async () => {
		const result = await runGitCommit(runner, { message: '   ' });
		expect(result.isError).toBe(true);
	});

	it('rejects a message without a Conventional Commit prefix', async () => {
		await writeFile(join(repoDir, 'f.txt'), 'f\n', 'utf8');
		const result = await runGitCommit(runner, {
			message: 'add f.txt',
			files: ['f.txt'],
		});
		expect(result.isError).toBe(true);
		expect(
			(result.structuredContent as { error: { reason: string } }).error
				.reason,
		).toContain('Conventional Commit prefix');
	});

	describe('push', () => {
		let remoteDir = '';
		let cloneDir = '';
		let cloneRunner: IGitRunner;

		beforeEach(async () => {
			remoteDir = await mkdtemp(join(tmpdir(), 'git-remote-'));
			await run('git', ['init', '-q', '--bare'], remoteDir);

			cloneDir = await mkdtemp(join(tmpdir(), 'git-clone-'));
			await rm(cloneDir, { recursive: true, force: true });
			await run('git', ['clone', '-q', remoteDir, cloneDir], tmpdir());
			await run(
				'git',
				['config', 'user.email', 'agent-a@example.com'],
				cloneDir,
			);
			await run('git', ['config', 'user.name', 'agent-a'], cloneDir);
			await writeFile(join(cloneDir, 'README.md'), '# init\n', 'utf8');
			await run('git', ['add', '.'], cloneDir);
			await run('git', ['commit', '-q', '-m', 'chore: init'], cloneDir);
			await run(
				'git',
				['push', '-q', 'origin', 'HEAD:refs/heads/main'],
				cloneDir,
			);
			await run('git', ['checkout', '-q', '-b', 'agent/a'], cloneDir);
			cloneRunner = createGitRunner(cloneDir);
		});

		afterEach(async () => {
			await rm(remoteDir, { recursive: true, force: true });
			await rm(cloneDir, { recursive: true, force: true });
		});

		it('pushes a normal commit to a non-protected branch', async () => {
			await writeFile(join(cloneDir, 'g.txt'), 'g\n', 'utf8');
			await runGitCommit(cloneRunner, {
				message: 'feat: add g.txt',
				files: ['g.txt'],
			});
			const result = await runGitPush(cloneRunner, {
				remote: 'origin',
				branch: 'agent/a',
			});
			expect(result.isError).toBeUndefined();
			expect(
				(result.structuredContent as { pushed: boolean }).pushed,
			).toBe(true);
		});

		it('pushes with --force-with-lease', async () => {
			await writeFile(join(cloneDir, 'h.txt'), 'h\n', 'utf8');
			await runGitCommit(cloneRunner, {
				message: 'feat: add h.txt',
				files: ['h.txt'],
			});
			await runGitPush(cloneRunner, {
				remote: 'origin',
				branch: 'agent/a',
			});

			// Amend so a plain push would be rejected (non-fast-forward),
			// proving --force-with-lease is what makes the second push succeed.
			await writeFile(join(cloneDir, 'h.txt'), 'h v2\n', 'utf8');
			await runGitCommit(cloneRunner, {
				message: 'feat: amend h.txt',
				files: ['h.txt'],
				amend: true,
				agent: 'agent-a',
			});
			const result = await runGitPush(cloneRunner, {
				remote: 'origin',
				branch: 'agent/a',
				force: 'with-lease',
			});
			expect(result.isError).toBeUndefined();
			expect(
				(result.structuredContent as { pushed: boolean }).pushed,
			).toBe(true);
		});

		it('refuses to push directly to a protected branch (main)', async () => {
			const result = await runGitPush(cloneRunner, {
				remote: 'origin',
				branch: 'main',
			});
			expect(result.isError).toBe(true);
			expect(
				(result.structuredContent as { error: { reason: string } })
					.error.reason,
			).toContain('protected branch');
		});
	});
});
