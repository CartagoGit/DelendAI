/**
 * search-gitignore.spec.ts (M11)
 *
 * `.gitignore` at the workspace root is respected by default: ignored
 * files/dirs are skipped, `!` negation re-includes, and `respectGitignore:
 * false` opts out.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { searchWorkspace } from '@mcp-vertex/search/lib/services/search-engine.service';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('search respects .gitignore (M11)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-gi-'));
		write(root, 'src/a.ts', 'needle here\n');
		write(root, 'generated/b.ts', 'needle here\n');
		write(root, 'logs/app.txt', 'needle here\n');
		write(root, 'logs/keep.txt', 'needle here\n');
		write(root, 'vendor/deep/nested/c.ts', 'needle here\n');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('skips a whole directory matched by a bare pattern, at any depth', async () => {
		write(root, '.gitignore', 'generated\nvendor\n');
		const res = await searchWorkspace(root, 'needle');
		const files = res.hits.map((h) => h.file).sort();
		expect(files).toEqual(['logs/app.txt', 'logs/keep.txt', 'src/a.ts']);
	});

	it('honors negation to re-include a specific file', async () => {
		write(root, '.gitignore', '*.txt\n!logs/keep.txt\n');
		const res = await searchWorkspace(root, 'needle');
		const files = res.hits.map((h) => h.file).sort();
		expect(files).toContain('logs/keep.txt');
		expect(files).not.toContain('logs/app.txt');
	});

	it('anchored pattern (leading /) only matches at the root', async () => {
		write(root, 'src/generated/d.ts', 'needle here\n');
		write(root, '.gitignore', '/generated\n');
		const res = await searchWorkspace(root, 'needle');
		const files = res.hits.map((h) => h.file).sort();
		// Root-level generated/b.ts is skipped; src/generated/d.ts is NOT
		// (the anchored pattern only applies at the gitignore's own level).
		expect(files).toContain('src/generated/d.ts');
		expect(files).not.toContain('generated/b.ts');
	});

	it('ignores nothing when there is no .gitignore', async () => {
		const res = await searchWorkspace(root, 'needle');
		expect(res.hits.map((h) => h.file).sort()).toEqual([
			'generated/b.ts',
			'logs/app.txt',
			'logs/keep.txt',
			'src/a.ts',
			'vendor/deep/nested/c.ts',
		]);
	});

	it('respectGitignore:false opts back out', async () => {
		write(root, '.gitignore', 'generated\nvendor\n');
		const res = await searchWorkspace(root, 'needle', {
			respectGitignore: false,
		});
		expect(res.hits.map((h) => h.file).sort()).toEqual([
			'generated/b.ts',
			'logs/app.txt',
			'logs/keep.txt',
			'src/a.ts',
			'vendor/deep/nested/c.ts',
		]);
	});
});
