/**
 * Against a real repository: the answer is whatever git says, and a stub
 * would only repeat what it was told.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner } from '@delendai/core/public';

import { sliceFilesAreCommitted } from '../../../../src/lib/services/slice-persisted.service';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

const repo = async () => {
	const created = await createTempGitRepo({ branch: 'develop' });
	cleanups.push(created.cleanup);
	await writeFile(join(created.cwd, 'a.ts'), 'export const a = 1;\n');
	await created.git('add', '--', 'a.ts');
	await created.git('commit', '-q', '-m', 'feat: a');
	return created;
};

describe('sliceFilesAreCommitted', () => {
	it('is true for a slice whose files were committed earlier', async () => {
		const r = await repo();
		expect(
			await sliceFilesAreCommitted(r.runner, ['a.ts', 'README.md']),
		).toBe(true);
	});

	it('is false while any of its files is modified or untracked', async () => {
		const r = await repo();
		await writeFile(join(r.cwd, 'a.ts'), 'export const a = 2;\n');
		expect(await sliceFilesAreCommitted(r.runner, ['a.ts'])).toBe(false);
		await r.git('checkout', '--', 'a.ts');
		await writeFile(join(r.cwd, 'new.ts'), 'export {};\n');
		expect(await sliceFilesAreCommitted(r.runner, ['a.ts', 'new.ts'])).toBe(
			false,
		);
	});

	it('is false when git cannot answer or the slice names no files', async () => {
		const notARepo = await mkdtemp(join(tmpdir(), 'not-a-repo-'));
		cleanups.push(() => rm(notARepo, { recursive: true, force: true }));
		expect(
			await sliceFilesAreCommitted(createWriteGitRunner(notARepo), [
				'a.ts',
			]),
		).toBe(false);
		const r = await repo();
		expect(await sliceFilesAreCommitted(r.runner, [])).toBe(false);
	});
});
