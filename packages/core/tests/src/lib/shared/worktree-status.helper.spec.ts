/**
 * worktree-status.helper.spec.ts — the one status the dirty-state readers
 * share, parsed from porcelain v2 and read from a real worktree.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	parseWorktreeStatus,
	readWorktreeChanges,
	readWorktreeStatus,
	worktreeStatusPaths,
} from '@delendai/core/lib/shared/worktree-status.helper';
import { createGitRepoTemplate } from '@delendai/test-kit';

const template = createGitRepoTemplate({
	trunk: 'main',
	files: { 'a.txt': 'a\n', 'b.txt': 'b\n' },
});

const HASH = 'f'.repeat(40);

describe('parseWorktreeStatus', () => {
	it('reads the branch headers and every kind of entry', () => {
		const status = parseWorktreeStatus(
			[
				`# branch.oid ${HASH}`,
				'# branch.head main',
				'# branch.upstream origin/main',
				'# branch.ab +2 -3',
				`1 .M N... 100644 100644 100644 ${HASH} ${HASH} src/a b.ts`,
				`2 R. N... 100644 100644 100644 ${HASH} ${HASH} R100 docs/new.md`,
				'docs/old.md',
				`u UU N... 100644 100644 100644 100644 ${HASH} ${HASH} ${HASH} c.ts`,
				'? tmp/x.ts',
				'! dist/y.js',
				'',
			].join('\0'),
		);
		expect(status.branch).toEqual({
			oid: HASH,
			head: 'main',
			upstream: 'origin/main',
			ahead: 2,
			behind: 3,
		});
		expect(status.entries).toEqual([
			{ code: ' M', path: 'src/a b.ts' },
			{ code: 'R ', path: 'docs/new.md', from: 'docs/old.md' },
			{ code: 'UU', path: 'c.ts' },
			{ code: '??', path: 'tmp/x.ts' },
			{ code: '!!', path: 'dist/y.js' },
		]);
		expect(worktreeStatusPaths(status)).toEqual([
			'src/a b.ts',
			'docs/new.md',
			'docs/old.md',
			'c.ts',
			'tmp/x.ts',
			'dist/y.js',
		]);
	});

	it('reads nothing from an empty or truncated answer', () => {
		expect(parseWorktreeStatus('')).toEqual({ branch: {}, entries: [] });
		expect(parseWorktreeStatus('1 .M\0').entries).toEqual([
			{ code: ' M', path: '' },
		]);
	});
});

describe('readWorktreeStatus', () => {
	it('lists a real worktree, untracked files one by one', () => {
		const { root, git } = template.copy();
		writeFileSync(join(root, 'a.txt'), 'changed\n');
		git('mv', 'b.txt', 'c.txt');
		writeFileSync(join(root, 'new.txt'), 'n\n');
		renameSync(join(root, 'new.txt'), join(root, 'fresh.txt'));
		const status = readWorktreeStatus(root);
		expect(status?.branch.head).toBe('main');
		expect(status?.entries).toEqual([
			{ code: ' M', path: 'a.txt' },
			{ code: 'R ', path: 'c.txt', from: 'b.txt' },
			{ code: '??', path: 'fresh.txt' },
		]);
		expect(readWorktreeChanges(root)).toEqual([
			'a.txt',
			'c.txt',
			'b.txt',
			'fresh.txt',
		]);
	});

	it('answers undefined where git cannot tell', () => {
		const missing = join(template.copy().root, 'gone');
		expect(readWorktreeStatus(missing)).toBeUndefined();
		expect(readWorktreeChanges(missing)).toBeUndefined();
	});
});
