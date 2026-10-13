import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findEmptyCommits, parseRevList } from './no-empty-commits.script';

describe('parseRevList', () => {
	it('drops the literal "commit" prefix `--format` puts on each header', () => {
		// The first version of this parser kept it, so `parts[0]` was
		// the word "commit", every line failed the sha test, and the
		// gate reported "ok" having examined nothing at all.
		const stdout = [
			'commit 6f86c57290900e6f20a5b2b1690d800cc35c9941 992ece6ebef5fbe62cce6a9d15ae92e09acb1c4a',
			'docs(proposals): a subject',
			'',
		].join('\n');
		const parsed = parseRevList(stdout);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.sha).toBe('6f86c57290900e6f20a5b2b1690d800cc35c9941');
		expect(parsed[0]?.parents).toEqual([
			'992ece6ebef5fbe62cce6a9d15ae92e09acb1c4a',
		]);
		expect(parsed[0]?.subject).toBe('docs(proposals): a subject');
	});

	it('records both parents of a merge, so a merge can be exempted', () => {
		const stdout = ['commit aaaaaaa bbbbbbb ccccccc', 'merge', ''].join(
			'\n',
		);
		expect(parseRevList(stdout)[0]?.parents).toHaveLength(2);
	});
});

describe('findEmptyCommits against a real repository', () => {
	let repo = '';
	const git = (...args: string[]): string =>
		execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), 'no-empty-commits-'));
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@example.com');
		git('config', 'user.name', 'Test');
		writeFileSync(join(repo, 'a.txt'), 'one\n');
		git('add', 'a.txt');
		git('commit', '-q', '-m', 'chore: seed');
	});
	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	it('finds a commit whose tree equals its parent’s', async () => {
		const base = git('rev-parse', 'HEAD').trim();
		// `--allow-empty` is how the test creates deliberately what
		// commit-policy was creating by accident.
		git(
			'commit',
			'-q',
			'--allow-empty',
			'-m',
			'feat(x00000): via slice S1',
		);
		const cwd = process.cwd();
		try {
			process.chdir(repo);
			const empties = await findEmptyCommits(`${base}..HEAD`);
			expect(empties).toHaveLength(1);
			expect(empties[0]?.subject).toBe('feat(x00000): via slice S1');
		} finally {
			process.chdir(cwd);
		}
	});

	it('does not flag a commit that changed something', async () => {
		const base = git('rev-parse', 'HEAD').trim();
		writeFileSync(join(repo, 'a.txt'), 'two\n');
		git('add', 'a.txt');
		git('commit', '-q', '-m', 'fix: change a');
		const cwd = process.cwd();
		try {
			process.chdir(repo);
			expect(await findEmptyCommits(`${base}..HEAD`)).toEqual([]);
		} finally {
			process.chdir(cwd);
		}
	});

	it('exempts a merge whose tree equals its first parent’s', async () => {
		// Normal and meaningful: it records that a branch was
		// integrated. Flagging it would make the gate unusable.
		const base = git('rev-parse', 'HEAD').trim();
		git('checkout', '-q', '-b', 'side');
		git('checkout', '-q', 'main');
		git('merge', '-q', '--no-ff', '-m', 'merge: side', 'side');
		const cwd = process.cwd();
		try {
			process.chdir(repo);
			expect(await findEmptyCommits(`${base}..HEAD`)).toEqual([]);
		} finally {
			process.chdir(cwd);
		}
	});
});
