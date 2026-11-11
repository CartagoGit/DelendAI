import { existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSharedGitRepoTemplate } from '../../../src/public/index';

/** Module scope, as a helper shared across spec files declares it. */
const template = createSharedGitRepoTemplate({
	trunk: 'develop',
	files: { 'a.txt': 'a\n' },
	worktrees: { unit: 'unit/work' },
});

describe('createSharedGitRepoTemplate', () => {
	it('[<250ms] copies one repository built on first use, each copy its own', () => {
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

	it('[<60ms] leaves the template whole when a copy is removed', () => {
		const first = template.copy();
		rmSync(dirname(first.root), { recursive: true, force: true });
		expect(template.copy().git('log', '--format=%s', '-1')).toBe('base');
	});
});
