import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { walkTsFiles } from '../../../../src/lib/scan/ts-walker';

describe('scan/ts-walker — walkTsFiles', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'scan-walker-'));
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('returns every .ts file under the requested root', async () => {
		mkdirSync(join(rootDir, 'src', 'lib'), { recursive: true });
		writeFileSync(
			join(rootDir, 'src', 'lib', 'a.ts'),
			'export const a = 1;',
		);
		writeFileSync(
			join(rootDir, 'src', 'lib', 'b.ts'),
			'export const b = 2;',
		);
		writeFileSync(
			join(rootDir, 'src', 'lib', 'c.tsx'),
			'export const c = 3;',
		);
		const out = await walkTsFiles(rootDir, ['src']);
		expect([...out].sort()).toEqual([
			'src/lib/a.ts',
			'src/lib/b.ts',
			'src/lib/c.tsx',
		]);
	});

	it('skips node_modules, dist, build, .cache, .git', async () => {
		mkdirSync(join(rootDir, 'src', 'real'), { recursive: true });
		mkdirSync(join(rootDir, 'node_modules', 'pkg'), { recursive: true });
		mkdirSync(join(rootDir, 'dist'), { recursive: true });
		mkdirSync(join(rootDir, 'build'), { recursive: true });
		mkdirSync(join(rootDir, '.cache'), { recursive: true });
		mkdirSync(join(rootDir, '.git'), { recursive: true });
		writeFileSync(
			join(rootDir, 'src', 'real', 'a.ts'),
			'export const a = 1;',
		);
		writeFileSync(
			join(rootDir, 'node_modules', 'pkg', 'b.ts'),
			'export const b = 2;',
		);
		writeFileSync(join(rootDir, 'dist', 'c.ts'), 'export const c = 3;');
		const out = await walkTsFiles(rootDir, ['']);
		expect(out).toEqual(['src/real/a.ts']);
	});

	it('ignores non-TS files', async () => {
		mkdirSync(join(rootDir, 'src'), { recursive: true });
		writeFileSync(join(rootDir, 'src', 'a.ts'), 'export const a = 1;');
		writeFileSync(join(rootDir, 'src', 'b.js'), 'module.exports = 2;');
		writeFileSync(join(rootDir, 'src', 'c.md'), '# not ts');
		const out = await walkTsFiles(rootDir, ['src']);
		expect(out).toEqual(['src/a.ts']);
	});

	it('silently skips a missing root', async () => {
		const out = await walkTsFiles(rootDir, ['does-not-exist']);
		expect(out).toEqual([]);
	});
});
