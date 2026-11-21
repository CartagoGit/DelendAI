import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	CHANGED_FILES_ENV,
	changedFilesScope,
	filesToJudge,
	parseChangedFiles,
} from './changed-files-scope';

describe('parseChangedFiles', () => {
	it('reads a JSON array, as the pull request passes it', () => {
		expect(parseChangedFiles('["a.ts","b/c.md"]')).toEqual([
			'a.ts',
			'b/c.md',
		]);
	});

	it('reads one path a line, as the local proof passes it', () => {
		expect(parseChangedFiles('a.ts\n\n b/c.md \n')).toEqual([
			'a.ts',
			'b/c.md',
		]);
	});

	it('keeps only the strings of a JSON array', () => {
		expect(parseChangedFiles('["a.ts", 3, null]')).toEqual(['a.ts']);
		expect(parseChangedFiles('[]')).toEqual([]);
	});
});

describe('changedFilesScope', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'changed-files-scope-'));
		writeFileSync(join(root, 'a.ts'), '');
		writeFileSync(join(root, 'b.md'), '');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const scope = (value: string | undefined) =>
		changedFilesScope(
			root,
			value === undefined ? {} : { [CHANGED_FILES_ENV]: value },
		);

	it('judges the changed files when the run is for a change', () => {
		expect([...(scope('["a.ts","b.md"]') ?? [])]).toEqual(['a.ts', 'b.md']);
	});

	it('judges the repository with no change list, an empty one or an unreadable one', () => {
		expect(scope(undefined)).toBeUndefined();
		expect(scope('  ')).toBeUndefined();
		expect(scope('[]')).toBeUndefined();
		expect(scope('[not json')).toBeUndefined();
	});

	it('reads the process environment by default', () => {
		vi.stubEnv(CHANGED_FILES_ENV, 'a.ts');
		try {
			expect([...(changedFilesScope(root) ?? [])]).toEqual(['a.ts']);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('judges the repository when the change removed a file, which an unchanged file can depend on', () => {
		expect(scope('a.ts\ngone.ts')).toBeUndefined();
	});
});

describe('filesToJudge', () => {
	const files = [{ path: 'a.ts' }, { path: 'b.ts' }];

	it('keeps every file, and says so, without a scope', () => {
		const judged = filesToJudge(files, (file) => file.path, undefined);
		expect(judged.files).toEqual(files);
		expect(judged.over).toBe('the repository');
	});

	it('keeps the changed files, and says how many there are', () => {
		const judged = filesToJudge(
			files,
			(file) => file.path,
			new Set(['b.ts', 'c.md']),
		);
		expect(judged.files).toEqual([{ path: 'b.ts' }]);
		expect(judged.over).toBe('the 2 changed file(s)');
	});
});
