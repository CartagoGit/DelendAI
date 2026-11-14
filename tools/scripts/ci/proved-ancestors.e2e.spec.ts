import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { chooseSelectionBase } from './proved-ancestors';
import {
	proofGitReader,
	proofStorePath,
	readProofs,
	recordPassedProof,
} from './proved-ancestors.store';

const roots: string[] = [];

const git = (root: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const commitFile = (root: string, name: string): string => {
	writeFileSync(join(root, name), name);
	git(root, 'add', name);
	git(
		root,
		'-c',
		'user.name=t',
		'-c',
		'user.email=t@example.test',
		'commit',
		'-q',
		'-m',
		name,
	);
	return git(root, 'rev-parse', 'HEAD');
};

const repository = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'proved-ancestors-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe('proved ancestors in a real repository', () => {
	it('[<2000ms] records a pass, then narrows the next proof to it', () => {
		const root = repository();
		const base = commitFile(root, 'one.txt');
		commitFile(root, 'two.txt');
		const proved = commitFile(root, 'three.txt');
		expect(recordPassedProof(root, base, 'fast')).toBe(true);
		commitFile(root, 'four.txt');
		const choice = chooseSelectionBase(
			base,
			readProofs(root),
			proofGitReader(root),
		);
		expect(choice).toMatchObject({ base: proved, proved: true, files: 1 });
	});

	it('[<2000ms] records nothing for a tree with edits', () => {
		const root = repository();
		const base = commitFile(root, 'one.txt');
		writeFileSync(join(root, 'one.txt'), 'edited');
		expect(recordPassedProof(root, base, 'fast')).toBe(false);
		expect(readProofs(root)).toEqual([]);
	});

	it('[<2000ms] prunes a record whose commit is gone', () => {
		const root = repository();
		const base = commitFile(root, 'one.txt');
		git(root, 'checkout', '-q', '-b', 'side');
		commitFile(root, 'two.txt');
		recordPassedProof(root, base, 'fast');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'branch', '-D', 'side');
		git(root, 'reflog', 'expire', '--expire=now', '--all');
		git(root, 'gc', '-q', '--prune=now');
		expect(readProofs(root)).toEqual([]);
		expect(proofStorePath(root)).toContain('proved-commits.json');
	});
});
