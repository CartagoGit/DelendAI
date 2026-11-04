import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { realScanDeps } from '../../../../src/lib/secrets/real-deps';

describe('realScanDeps', () => {
	it('fails a git listing that cannot run instead of returning no files', async () => {
		// Not a git repository: git ls-files exits non-zero.
		const root = await mkdtemp(join(tmpdir(), 'delendai-x01027-'));
		const deps = realScanDeps(root);
		await expect(deps.listFiles('tracked')).rejects.toThrow(
			/git ls-files failed/,
		);
		await expect(deps.listIgnored?.()).rejects.toThrow(/failed/);
	});

	it('lists changed and tracked files, ignored files, and reads text', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-x01027-repo-'));
		const git = (...args: string[]): void => {
			execFileSync('git', args, { cwd: root });
		};
		git('init', '-q');
		git('config', 'user.email', 'a@b.c');
		git('config', 'user.name', 'n');
		await writeFile(join(root, '.gitignore'), '.env.local\n');
		await writeFile(join(root, 'tracked.ts'), 'export const a = 1;\n');
		git('add', '-A');
		git('commit', '-qm', 'init');
		await writeFile(join(root, 'tracked.ts'), 'export const a = 2;\n');
		await writeFile(join(root, 'fresh.ts'), 'x\n');
		await writeFile(join(root, '.env.local'), 'TOKEN=1\n');
		await mkdir(join(root, 'sub'));

		const deps = realScanDeps(root);
		expect(await deps.listFiles('tracked')).toEqual(
			expect.arrayContaining(['tracked.ts', '.gitignore']),
		);
		expect(await deps.listFiles('changed')).toEqual(
			expect.arrayContaining(['tracked.ts', 'fresh.ts']),
		);
		expect(await deps.listIgnored?.()).toEqual(['.env.local']);
		expect(await deps.readFile('tracked.ts')).toBe('export const a = 2;\n');
		expect(await deps.readFile('missing.ts')).toBeUndefined();
	});
});
