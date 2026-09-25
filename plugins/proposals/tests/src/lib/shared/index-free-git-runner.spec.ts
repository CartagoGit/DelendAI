/**
 * index-free-git-runner.spec.ts — moves act on the working tree only;
 * reads still reach git (x00651 S1).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import { createIndexFreeGitRunner } from '@delendai/proposals/lib/shared/index-free-git-runner';

let dir = '';
let seen: string[][] = [];

const inner: IGitRunner = async (args) => {
	seen.push([...args]);
	return { ok: true, output: 'from git' };
};

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'index-free-'));
	seen = [];
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('createIndexFreeGitRunner', () => {
	it('renames on disk for mv, and never asks git', async () => {
		const from = join(dir, 'a.md');
		const to = join(dir, 'b.md');
		writeFileSync(from, 'x');

		const result = await createIndexFreeGitRunner(inner)(['mv', from, to]);

		expect(result.ok).toBe(true);
		expect(existsSync(to)).toBe(true);
		expect(existsSync(from)).toBe(false);
		expect(seen).toEqual([]);
	});

	it('refuses to move onto an existing file', async () => {
		const from = join(dir, 'a.md');
		const to = join(dir, 'b.md');
		writeFileSync(from, 'x');
		writeFileSync(to, 'y');

		const result = await createIndexFreeGitRunner(inner)(['mv', from, to]);

		expect(result.ok).toBe(false);
		expect(existsSync(from)).toBe(true);
	});

	it('deletes on disk for rm and does nothing for add', async () => {
		const path = join(dir, 'a.md');
		writeFileSync(path, 'x');
		const run = createIndexFreeGitRunner(inner);

		expect((await run(['rm', '-f', '--', path])).ok).toBe(true);
		expect((await run(['add', path])).ok).toBe(true);

		expect(existsSync(path)).toBe(false);
		expect(seen).toEqual([]);
	});

	it('passes every other command to git unchanged', async () => {
		const result = await createIndexFreeGitRunner(inner)([
			'ls-files',
			'--error-unmatch',
			'a.md',
		]);

		expect(result.output).toBe('from git');
		expect(seen).toEqual([['ls-files', '--error-unmatch', 'a.md']]);
	});

	it('hands a malformed mv to git rather than guessing', async () => {
		await createIndexFreeGitRunner(inner)(['mv']);

		expect(seen).toEqual([['mv']]);
	});
});
