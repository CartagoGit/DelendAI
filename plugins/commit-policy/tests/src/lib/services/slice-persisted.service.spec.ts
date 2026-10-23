/**
 * Against a real repository: the answer is whatever git says, and a stub
 * would only repeat what it was told.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner } from '@delendai/core/public';

import {
	createCommittedFilesProbe,
	sliceFilesAreCommitted,
} from '../../../../src/lib/services/slice-persisted.service';
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

describe('createCommittedFilesProbe', () => {
	it('answers many slices from one reading of the working tree', async () => {
		const r = await repo();
		await mkdir(join(r.cwd, 'lib'));
		await writeFile(join(r.cwd, 'lib', 'new.ts'), 'export const n = 1;\n');
		let calls = 0;
		const probe = createCommittedFilesProbe(
			(args) => {
				calls += 1;
				return r.runner(args);
			},
			() => 1000,
		);

		// What a server asks at start: once per finished slice.
		expect(await probe(['a.ts'])).toBe(true);
		expect(await probe(['lib/new.ts'])).toBe(false);
		expect(await probe(['./lib/'])).toBe(false);
		expect(await probe(['lib-other'])).toBe(true);
		expect(await probe(['a.ts', 'never-existed.ts'])).toBe(true);
		expect(await probe([])).toBe(false);
		expect(calls).toBe(1);
	});

	it('reads again once the reading is old', async () => {
		const r = await repo();
		let at = 1000;
		const probe = createCommittedFilesProbe(r.runner, () => at);
		expect(await probe(['a.ts'])).toBe(true);
		await writeFile(join(r.cwd, 'a.ts'), 'export const a = 2;\n');
		expect(await probe(['a.ts'])).toBe(true);
		at += 2000;
		expect(await probe(['a.ts'])).toBe(false);
	});

	it('sees both ends of a rename', async () => {
		const r = await repo();
		await r.git('mv', 'a.ts', 'b.ts');
		const probe = createCommittedFilesProbe(r.runner);
		expect(await probe(['a.ts'])).toBe(false);
		expect(await probe(['b.ts'])).toBe(false);
	});

	it('asks git itself for a pattern only git can expand', async () => {
		const r = await repo();
		await writeFile(join(r.cwd, 'a.ts'), 'export const a = 2;\n');
		const probe = createCommittedFilesProbe(r.runner);
		expect(await probe(['*.ts'])).toBe(false);
		expect(await probe(['*.md'])).toBe(true);
	});

	it('is false when git cannot answer', async () => {
		const probe = createCommittedFilesProbe(() =>
			Promise.resolve({
				ok: false,
				output: '',
				reason: 'not a repository',
			}),
		);
		expect(await probe(['a.ts'])).toBe(false);
	});
});
