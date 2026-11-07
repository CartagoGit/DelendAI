/**
 * git-invocation-memo.helper.spec.ts — one invocation asks git a repeated
 * question once, and asks again after anything git may have changed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runGitCommand } from '@delendai/core/lib/shared/git-command.helper';
import { withGitInvocationMemo } from '@delendai/core/lib/shared/git-invocation-memo.helper';
import {
	observeGitSpawns,
	readGit,
} from '@delendai/core/lib/shared/git-read.helper';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'git-memo-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, stdio: 'ignore' });
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'a@b.c');
	git('config', 'user.name', 'a');
	writeFileSync(join(root, 'a.txt'), 'x\n');
	git('add', 'a.txt');
	git('commit', '-qm', 'one');
	return root;
};

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
		expect(value[4]).toBe('a@b.c');
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
		expect(value).toEqual({ before: 'a@b.c', after: 'z@y.x' });
		expect(spawns).toEqual([
			'config --get user.email',
			'status --porcelain',
			'config user.email z@y.x',
			'config --get user.email',
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
});
