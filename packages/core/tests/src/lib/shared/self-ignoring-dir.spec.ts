/**
 * What delendai creates, git never shows.
 *
 * Measured against a real git repository: the question is not whether a
 * `.gitignore` was written, it is whether `git status` is clean
 * afterwards. That is what the person who opened the folder sees.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureSelfIgnoringDir } from '@delendai/core/lib/shared/self-ignoring-dir';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'self-ignoring-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
	return root;
};

const status = (root: string): string =>
	execFileSync('git', ['status', '--porcelain'], {
		cwd: root,
		encoding: 'utf8',
	});

describe('ensureSelfIgnoringDir', () => {
	it('leaves git status clean, directory and contents alike', async () => {
		// The whole claim. `.delendai/` was chosen because it "is already
		// gitignored" — true in this repository, which added the line, and
		// false in every other project, where it showed up unannounced the
		// moment a server started.
		const root = repo();
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		writeFileSync(
			join(root, '.delendai', 'migrations-applied.json'),
			'["a"]\n',
		);
		expect(status(root)).toBe('');
	});

	it('survives git add -A, which is how it actually gets committed', async () => {
		// `git status` being clean is not enough on its own: the way this
		// reaches somebody's colleagues is an agent or a person running
		// `git add -A` and not reading the list.
		const root = repo();
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		writeFileSync(join(root, '.delendai', 'applied-config.json'), '{}\n');
		writeFileSync(join(root, 'theirs.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', '-A'], { cwd: root });
		const staged = execFileSync(
			'git',
			['diff', '--cached', '--name-only'],
			{
				cwd: root,
				encoding: 'utf8',
			},
		);
		expect(staged.trim()).toBe('theirs.ts');
	});

	it('does not touch the project’s own .gitignore', async () => {
		// That file is the project's, with the project's history in it.
		// The point of this module is that starting a tool does not edit
		// what somebody else owns.
		const root = repo();
		writeFileSync(join(root, '.gitignore'), 'node_modules\n');
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(
			'node_modules\n',
		);
	});

	it('says what it is, to whoever opens it', async () => {
		const root = repo();
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		const body = readFileSync(
			join(root, '.delendai', '.gitignore'),
			'utf8',
		);
		expect(body).toContain('delendai');
		expect(body).toContain('*');
	});

	it('keeps a .gitignore the project deliberately wrote', async () => {
		const root = repo();
		await mkdir(join(root, '.delendai'), { recursive: true });
		writeFileSync(join(root, '.delendai', '.gitignore'), '!keep-me\n');
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		expect(
			readFileSync(join(root, '.delendai', '.gitignore'), 'utf8'),
		).toBe('!keep-me\n');
	});

	it('is safe to call again, and again', async () => {
		const root = repo();
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		await ensureSelfIgnoringDir(join(root, '.delendai'));
		expect(status(root)).toBe('');
	});
});
