/**
 * search-regex-glob.spec.ts (M11)
 *
 * Regex matching and include/exclude path globs for the search engine.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	InvalidSearchPatternError,
	searchWorkspace,
} from '@mcp-vertex/search/lib/services/search-engine.service';

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

describe('search regex + glob (M11)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-rg-'));
		write(root, 'src/a.ts', 'const TODO_id = 42;\nfunction run() {}\n');
		write(root, 'src/b.ts', 'const value = 7;\n// TODO: later\n');
		write(root, 'docs/c.md', 'a TODO in markdown\nfunction words\n');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('matches a JS regex when regex:true', async () => {
		const res = await searchWorkspace(root, 'const \\w+ =', {
			regex: true,
		});
		const files = res.hits.map((h) => h.file).sort();
		expect(files).toEqual(['src/a.ts', 'src/b.ts']);
	});

	it('regex is case-insensitive by default, case-sensitive on request', async () => {
		expect(
			(await searchWorkspace(root, 'todo', { regex: true })).hits.length,
		).toBe(3);
		expect(
			(
				await searchWorkspace(root, 'todo', {
					regex: true,
					caseSensitive: true,
				})
			).hits.length,
		).toBe(0);
	});

	it('throws InvalidSearchPatternError on a bad regex', async () => {
		await expect(
			searchWorkspace(root, '(', { regex: true }),
		).rejects.toBeInstanceOf(InvalidSearchPatternError);
	});

	it('include glob replaces the extension allow-list (only matching paths)', async () => {
		const res = await searchWorkspace(root, 'TODO', {
			include: ['src/**/*.ts'],
		});
		const files = [...new Set(res.hits.map((h) => h.file))].sort();
		expect(files).toEqual(['src/a.ts', 'src/b.ts']); // docs/c.md excluded by glob
	});

	it('exclude glob removes matching paths and wins over include', async () => {
		const res = await searchWorkspace(root, 'TODO', {
			include: ['**/*.ts', '**/*.md'],
			exclude: ['docs/**'],
		});
		const files = [...new Set(res.hits.map((h) => h.file))].sort();
		expect(files).toEqual(['src/a.ts', 'src/b.ts']);
	});
});
