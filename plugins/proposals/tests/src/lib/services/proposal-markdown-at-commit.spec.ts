import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	collectProposalMarkdownAtCommit,
	resolveCommit,
} from '../../../../src/lib/services/proposal-markdown-at-commit';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (root: string, ...args: string[]): string =>
	execFileSync(
		'git',
		[
			'-c',
			'user.name=Spec',
			'-c',
			'user.email=spec@example.invalid',
			'-c',
			'commit.gpgsign=false',
			...args,
		],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
	).trim();

const write = (root: string, path: string, body: string): void => {
	const full = join(root, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, body, 'utf8');
};

const repository = (): {
	readonly root: string;
	readonly proposalsDir: string;
} => {
	const root = mkdtempSync(join(tmpdir(), 'proposal-at-commit-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	return { root, proposalsDir: join(root, 'docs/delendai/proposals') };
};

const commitAll = (root: string, message: string): string => {
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '--no-verify', '-m', message);
	return git(root, 'rev-parse', 'HEAD');
};

describe('the proposal tree as a commit holds it', () => {
	it('reads the committed bytes, whatever the worktree and the branch did since', () => {
		const { root, proposalsDir } = repository();
		// Multi-byte text: the batch reader splits by byte counts.
		write(root, 'docs/delendai/proposals/ready/feats/a.md', '# A ✓\n');
		write(root, 'docs/delendai/proposals/done/fixes/b.md', '# B\n');
		write(
			root,
			'docs/delendai/proposals/ready/notes.txt',
			'not markdown\n',
		);
		write(root, 'docs/elsewhere.md', '# outside the tree\n');
		const first = commitAll(root, 'first');

		write(root, 'docs/delendai/proposals/ready/feats/a.md', '# A edited\n');
		write(root, 'docs/delendai/proposals/ready/feats/c.md', '# C\n');
		commitAll(root, 'second');
		write(
			root,
			'docs/delendai/proposals/ready/feats/d.md',
			'# D, uncommitted\n',
		);

		const atFirst = collectProposalMarkdownAtCommit(
			root,
			proposalsDir,
			first,
		);
		expect(atFirst.sha).toBe(first);
		expect(atFirst.files).toEqual([
			{ path: 'done/fixes/b.md', raw: '# B\n' },
			{ path: 'ready/feats/a.md', raw: '# A ✓\n' },
		]);

		const atBranch = collectProposalMarkdownAtCommit(
			root,
			proposalsDir,
			'develop',
		);
		expect(atBranch.sha).toBe(git(root, 'rev-parse', 'develop'));
		expect(atBranch.files.map((file) => file.path)).toEqual([
			'done/fixes/b.md',
			'ready/feats/a.md',
			'ready/feats/c.md',
		]);
	});

	it('returns no files for a commit without the tree', () => {
		const { root, proposalsDir } = repository();
		write(root, 'README.md', '# repo\n');
		const sha = commitAll(root, 'no proposals');
		expect(
			collectProposalMarkdownAtCommit(root, proposalsDir, sha),
		).toEqual({
			sha,
			files: [],
		});
	});

	it('refuses a reference that is not a commit, or that reads as an option', () => {
		const { root, proposalsDir } = repository();
		write(root, 'README.md', '# repo\n');
		commitAll(root, 'one');
		expect(() => resolveCommit(root, '--output=/tmp/x')).toThrow(
			'not a commit reference',
		);
		expect(() => resolveCommit(root, ' ')).toThrow(
			'not a commit reference',
		);
		expect(() => resolveCommit(root, 'no-such-branch')).toThrow();
		expect(() =>
			collectProposalMarkdownAtCommit(
				root,
				join(root, '..', 'x'),
				'develop',
			),
		).toThrow('is not inside');
		expect(() =>
			collectProposalMarkdownAtCommit(root, root, 'develop'),
		).toThrow('is not inside');
		expect(proposalsDir.startsWith(root)).toBe(true);
	});
});
