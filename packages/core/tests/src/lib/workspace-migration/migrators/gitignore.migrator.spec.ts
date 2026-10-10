/**
 * gitignore.migrator.spec.ts — an ignore line naming a renamed path names
 * the new one, and no line is there twice.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createGitignoreMigrator,
	rewriteIgnoreLines,
} from '@delendai/core/lib/workspace-migration/migrators/gitignore.migrator';

let root = '';
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'gitignore-migrator-'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const ctx = (dryRun = false) => ({ workspaceRoot: root, dryRun });

describe('rewriteIgnoreLines', () => {
	it('names the new path, keeping the pattern, the negation and the order', () => {
		const { content, changes } = rewriteIgnoreLines(
			[
				'# build',
				'node_modules/',
				'/.cache/mcp-vertex/',
				'!docs/mcp-vertex/keep.md',
				'mcp-vertex.config.json',
				'dist/',
			].join('\n'),
		);
		expect(content.split('\n')).toEqual([
			'# build',
			'node_modules/',
			'/.cache/delendai/',
			'!docs/delendai/keep.md',
			'delendai.config.json',
			'dist/',
		]);
		expect(changes).toHaveLength(3);
	});

	it('drops the old line where the new one is already there', () => {
		expect(
			rewriteIgnoreLines('.cache/delendai/\n.cache/mcp-vertex/\n')
				.content,
		).toBe('.cache/delendai/\n');
	});

	it('changes nothing in a file that names no renamed path', () => {
		const text = 'node_modules/\n.cache/delendai/\n';
		expect(rewriteIgnoreLines(text)).toEqual({
			content: text,
			changes: [],
		});
	});
});

describe('createGitignoreMigrator', () => {
	it('rewrites the workspace .gitignore, and only plans in a dry run', async () => {
		await writeFile(join(root, '.gitignore'), '.cache/mcp-vertex/\n');
		const migrator = createGitignoreMigrator();
		expect(await migrator.detect(ctx())).toBe(true);

		await migrator.apply(ctx(true));
		expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe(
			'.cache/mcp-vertex/\n',
		);

		await migrator.apply(ctx());
		expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe(
			'.cache/delendai/\n',
		);
		expect(await migrator.detect(ctx())).toBe(false);
	});

	it('has nothing to do without a .gitignore', async () => {
		expect(await createGitignoreMigrator().detect(ctx())).toBe(false);
	});
});
