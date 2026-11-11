import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createSharedGitFixture,
	createSharedGitRepoTemplate,
} from '../../../src/public/index';

/** Module scope, as a helper shared across spec files declares it. */
const template = createSharedGitRepoTemplate({
	trunk: 'develop',
	files: { 'a.txt': 'a\n' },
	worktrees: { unit: 'unit/work' },
});

describe('createSharedGitRepoTemplate', () => {
	it('[<119ms] copies one repository built on first use, each copy its own', () => {
		const one = template.copy();
		const two = template.copy();
		try {
			expect(one.root).not.toBe(two.root);
			expect(one.git('symbolic-ref', '--short', 'HEAD')).toBe('develop');
			expect(existsSync(`${one.root}/a.txt`)).toBe(true);
			const { unit } = one.worktrees;
			expect(one.git('worktree', 'list', '--porcelain')).toContain(unit);
			one.git('commit', '--allow-empty', '-q', '-m', 'only here');
			expect(two.git('log', '--format=%s', '-1')).toBe('base');
		} finally {
			// Each copy is its caller's to remove.
			for (const copy of [one, two]) {
				rmSync(dirname(copy.root), { recursive: true, force: true });
			}
		}
	});

	it('[<21ms] leaves the template whole when a copy is removed', () => {
		const first = template.copy();
		rmSync(dirname(first.root), { recursive: true, force: true });
		expect(template.copy().git('log', '--format=%s', '-1')).toBe('base');
	});
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A bare origin and a clone that names it, as a helper's builder makes them. */
const pair = createSharedGitFixture((root) => {
	mkdirSync(join(root, 'origin.git'));
	git(join(root, 'origin.git'), 'init', '-q', '--bare');
	git(root, 'clone', '-q', join(root, 'origin.git'), 'clone');
});

describe('createSharedGitFixture', () => {
	it('[<120ms] copies what the builder made, its paths naming the copy', () => {
		const copy = pair.copy();
		try {
			expect(
				git(join(copy, 'clone'), 'remote', 'get-url', 'origin'),
			).toBe(join(copy, 'origin.git'));
			expect(existsSync(join(copy, 'origin.git', 'HEAD'))).toBe(true);
		} finally {
			rmSync(copy, { recursive: true, force: true });
		}
	});
});
