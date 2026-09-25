/**
 * work-dirty-paths.service.spec.ts — which edits a work ref holds,
 * against a real repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parsePorcelainZ, reportDirtyPaths } from './work-dirty-paths.service';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' });

const readGit =
	(cwd: string) =>
	(args: readonly string[]): string | undefined => {
		try {
			return git(cwd, ...args);
		} catch {
			return undefined;
		}
	};

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'dirty-paths-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'dirty@example.com');
	git(root, 'config', 'user.name', 'Dirty');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.ts'), 'export const a = 0;\n');
	writeFileSync(join(root, 'docs-moved.md'), '# moved\n');
	git(root, 'add', '.');
	git(root, 'commit', '-q', '--no-verify', '-m', 'base');
	return root;
};

/** A work ref holding `a.ts` with the given content, built off to the side. */
const workRefHolding = (root: string, content: string): string => {
	const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
		cwd: root,
		input: content,
		encoding: 'utf8',
	}).trim();
	const env = { ...process.env, GIT_INDEX_FILE: join(root, '.git', 'wip') };
	execFileSync('git', ['read-tree', 'develop'], { cwd: root, env });
	execFileSync(
		'git',
		['update-index', '--cacheinfo', `100644,${blob},a.ts`],
		{ cwd: root, env },
	);
	const tree = execFileSync('git', ['write-tree'], {
		cwd: root,
		env,
		encoding: 'utf8',
	}).trim();
	return git(root, 'commit-tree', tree, '-p', 'develop', '-m', 'wip').trim();
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('parsePorcelainZ', () => {
	it('keeps both paths of a rename intact', () => {
		expect(
			parsePorcelainZ(
				'R  docs/new.md\0docs/old.md\0 M src/a.ts\0?? tmp/x.ts\0',
			),
		).toEqual(['docs/new.md', 'docs/old.md', 'src/a.ts', 'tmp/x.ts']);
	});

	it('keeps both paths of a copy and of a rename staged then modified', () => {
		expect(parsePorcelainZ('C  b.ts\0a.ts\0RM d.md\0c.md\0')).toEqual([
			'b.ts',
			'a.ts',
			'd.md',
			'c.md',
		]);
	});
});

describe('reportDirtyPaths', () => {
	it('reports a rename from a real status with its source path whole', () => {
		const root = repo();
		git(root, 'mv', 'docs-moved.md', 'docs-renamed.md');
		const report = reportDirtyPaths({ git: readGit(root), refs: [] });
		expect(report.dirty).toEqual(['docs-renamed.md', 'docs-moved.md']);
		expect(report.undurable).toEqual(report.dirty);
	});

	it('lists an edit no work ref holds as undurable', () => {
		const root = repo();
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		const report = reportDirtyPaths({ git: readGit(root), refs: [] });
		expect(report).toEqual({ dirty: ['a.ts'], undurable: ['a.ts'] });
	});

	it('does not list an edit a work ref holds byte for byte', () => {
		const root = repo();
		const content = 'export const a = 1;\n';
		writeFileSync(join(root, 'a.ts'), content);
		const tip = workRefHolding(root, content);
		const report = reportDirtyPaths({
			git: readGit(root),
			refs: [{ tip, paths: ['a.ts'] }],
		});
		expect(report).toEqual({ dirty: ['a.ts'], undurable: [] });
	});

	it('lists an edit made after the last checkpoint as undurable', () => {
		const root = repo();
		const tip = workRefHolding(root, 'export const a = 1;\n');
		writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
		const report = reportDirtyPaths({
			git: readGit(root),
			refs: [{ tip, paths: ['a.ts'] }],
		});
		expect(report.undurable).toEqual(['a.ts']);
	});
});
