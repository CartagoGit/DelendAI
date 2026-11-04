/**
 * git-read.helper.spec.ts — the one synchronous git read answers about
 * the repository it was asked about, inside a hook too.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	gitVerbatim,
	readGit,
} from '@delendai/core/lib/shared/git-read.helper';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
	delete process.env.GIT_DIR;
});

const repo = (file: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'git-read-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
	writeFileSync(join(root, file), 'x\n');
	return root;
};

describe('readGit', () => {
	it('answers trimmed, or untouched when asked, and undefined on failure', () => {
		const root = repo('a.txt');
		expect(readGit(root, ['rev-parse', '--is-inside-work-tree'])).toBe(
			'true',
		);
		expect(gitVerbatim(root, ['status', '--porcelain'])).toBe('?? a.txt\n');
		expect(readGit(root, ['no-such-command'])).toBeUndefined();
	});

	it('writes its input to git', () => {
		const root = repo('a.txt');
		expect(
			readGit(root, ['hash-object', '--stdin'], { input: 'x\n' }),
		).toBe(readGit(root, ['hash-object', 'a.txt']));
	});

	it('answers about the repository asked, not the one a hook names', () => {
		const hook = repo('hook-only.txt');
		const asked = repo('asked-only.txt');
		process.env.GIT_DIR = join(hook, '.git');
		expect(gitVerbatim(asked, ['status', '--porcelain'])).toBe(
			'?? asked-only.txt\n',
		);
	});
});
