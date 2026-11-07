/**
 * git-invocation-memo.helper.spec.ts — one invocation asks git a repeated
 * question once, and asks again after anything git may have changed.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runGitCommand } from '@delendai/core/lib/shared/git-command.helper';
import { withGitInvocationMemo } from '@delendai/core/lib/shared/git-invocation-memo.helper';
import {
	forgetGitReads,
	observeGitSpawns,
	readGit,
} from '@delendai/core/lib/shared/git-read.helper';
import { createGitRunner } from '@delendai/core/lib/shared/git-write';
import {
	readWorktreeChanges,
	WORKTREE_STATUS_ARGS,
} from '@delendai/core/lib/shared/worktree-status.helper';
import { createGitRepoTemplate } from '@delendai/test-kit';

const template = createGitRepoTemplate({
	trunk: 'main',
	files: { 'a.txt': 'x\n' },
});

const remoteTemplate = createGitRepoTemplate({
	trunk: 'main',
	files: { 'a.txt': 'x\n' },
	remote: true,
});

const repo = (): string => template.copy().root;

const counting = <T>(body: () => T): { value: T; spawns: string[] } => {
	const spawns: string[] = [];
	const stop = observeGitSpawns(({ args }) => spawns.push(args.join(' ')));
	try {
		return { value: body(), spawns };
	} finally {
		stop();
	}
};

const COMMON_DIR = ['rev-parse', '--path-format=absolute', '--git-common-dir'];

describe('withGitInvocationMemo', () => {
	it('asks a repository question once per invocation', () => {
		const root = repo();
		const { value, spawns } = counting(() =>
			withGitInvocationMemo(() => [
				readGit(root, COMMON_DIR),
				readGit(root, COMMON_DIR),
				readGit(root, ['remote']),
				readGit(root, ['remote']),
				readGit(root, ['config', '--get', 'user.email']),
				readGit(root, ['config', '--get', 'user.email']),
				readGit(root, ['worktree', 'list', '--porcelain']),
				readGit(root, ['worktree', 'list', '--porcelain']),
			]),
		);
		expect(value[0]).toBe(value[1]);
		expect(value[4]).toBe('spec@example.test');
		expect(spawns).toHaveLength(4);
	});

	it('asks again after a write, and not after a read', () => {
		const root = repo();
		const { value, spawns } = counting(() =>
			withGitInvocationMemo(() => {
				const before = readGit(root, ['config', '--get', 'user.email']);
				readGit(root, ['status', '--porcelain']);
				readGit(root, ['config', '--get', 'user.email']);
				runGitCommand(root, ['config', 'user.email', 'z@y.x']);
				const after = readGit(root, ['config', '--get', 'user.email']);
				return { before, after };
			}),
		);
		expect(value).toEqual({ before: 'spec@example.test', after: 'z@y.x' });
		expect(spawns).toEqual([
			'config --get user.email',
			'status --porcelain',
			'config user.email z@y.x',
			'config --get user.email',
		]);
	});

	it('lists a worktree once until git writes, and asks ls-remote once', () => {
		const { root, remote } = remoteTemplate.copy();
		const { value, spawns } = counting(() =>
			withGitInvocationMemo(() => {
				const first = readWorktreeChanges(root);
				readWorktreeChanges(root);
				readGit(root, ['ls-remote', '--', 'origin', 'refs/heads/*']);
				readGit(root, ['ls-remote', '--', 'origin', 'refs/heads/*']);
				writeFileSync(join(root, 'a.txt'), 'changed\n');
				runGitCommand(root, ['add', 'a.txt']);
				return [first, readWorktreeChanges(root)];
			}),
		);
		expect(remote).toBeDefined();
		expect(value).toEqual([[], ['a.txt']]);
		expect(spawns).toEqual([
			WORKTREE_STATUS_ARGS.join(' '),
			'ls-remote -- origin refs/heads/*',
			'add a.txt',
			WORKTREE_STATUS_ARGS.join(' '),
		]);
	});

	it('reads one symbolic ref once, and a symbolic-ref write forgets', () => {
		const root = repo();
		const read = ['symbolic-ref', '--quiet', '--short', 'HEAD'];
		const { spawns } = counting(() =>
			withGitInvocationMemo(() => {
				readGit(root, read);
				readGit(root, read);
				runGitCommand(root, [
					'symbolic-ref',
					'refs/heads/alias',
					'refs/heads/main',
				]);
				readGit(root, read);
			}),
		);
		expect(spawns).toEqual([
			read.join(' '),
			'symbolic-ref refs/heads/alias refs/heads/main',
			read.join(' '),
		]);
	});

	it('keeps a question about two object ids across writes', () => {
		const root = repo();
		const head = readGit(root, ['rev-parse', 'HEAD']) ?? '';
		const ask = ['merge-base', '--is-ancestor', head, head];
		const { spawns } = counting(() =>
			withGitInvocationMemo(() => {
				readGit(root, ask);
				runGitCommand(root, ['update-ref', 'refs/heads/x', head]);
				readGit(root, ask);
			}),
		);
		expect(spawns).toEqual([
			ask.join(' '),
			`update-ref refs/heads/x ${head}`,
		]);
	});

	it('remembers nothing outside its invocation, nor between two', async () => {
		const root = repo();
		const { spawns } = counting(() => {
			withGitInvocationMemo(() => readGit(root, COMMON_DIR));
			withGitInvocationMemo(() => readGit(root, COMMON_DIR));
			readGit(root, COMMON_DIR);
			readGit(root, COMMON_DIR);
		});
		expect(spawns).toHaveLength(4);
		const both = await Promise.all([
			withGitInvocationMemo(async () => {
				await Promise.resolve();
				return readGit(root, ['remote']);
			}),
			withGitInvocationMemo(async () => readGit(root, ['remote'])),
		]);
		expect(both).toEqual(['', '']);
	});

	it('resolves a ref once until a ref is written, through any runner', async () => {
		const root = repo();
		const verify = ['rev-parse', '-q', '--verify', 'refs/heads/main'];
		const { value, spawns } = await (async () => {
			const seen: string[] = [];
			const stop = observeGitSpawns(({ args }) =>
				seen.push(args[0] ?? ''),
			);
			const answers = await withGitInvocationMemo(async () => {
				const first = readGit(root, verify);
				readGit(root, verify);
				readGit(root, ['for-each-ref', '--format=%(refname)']);
				readGit(root, ['for-each-ref', '--format=%(refname)']);
				await createGitRunner(root)([
					'commit',
					'-q',
					'--allow-empty',
					'-m',
					'two',
				]);
				return [first, readGit(root, verify)];
			});
			stop();
			return { value: answers, spawns: seen };
		})();
		expect(value[0]).not.toBe(value[1]);
		expect(spawns).toEqual([
			'rev-parse',
			'for-each-ref',
			'commit',
			'rev-parse',
		]);
	});

	it('forgets when a process that is not git ran', () => {
		const root = repo();
		const { spawns } = counting(() =>
			withGitInvocationMemo(() => {
				readGit(root, ['symbolic-ref', '--short', 'HEAD']);
				forgetGitReads();
				readGit(root, ['symbolic-ref', '--short', 'HEAD']);
			}),
		);
		expect(spawns).toHaveLength(2);
	});
});
