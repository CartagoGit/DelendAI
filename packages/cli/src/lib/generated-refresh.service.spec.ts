/**
 * generated-refresh.service.spec.ts — after a merge, what the generators
 * say about the finished tree is what gets committed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { GENERATED_REFRESH_PATHS } from '../contracts/constants/generated-refresh.constant';
import { refreshGeneratedAfterMerge } from './generated-refresh.service';

const roots: string[] = [];
const GENERATED = GENERATED_REFRESH_PATHS[0] as string;

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'generated-refresh-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'gen@example.com');
	git(root, 'config', 'user.name', 'Gen');
	git(root, 'config', 'commit.gpgsign', 'false');
	execFileSync('mkdir', ['-p', join(root, 'docs/delendai/host-hints')]);
	writeFileSync(join(root, GENERATED), 'count: 1\n');
	writeFileSync(join(root, 'authored.ts'), 'export const a = 1;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('refreshGeneratedAfterMerge (x00559)', () => {
	it('commits exactly what the generators changed', () => {
		const root = repo();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 2\n');
				return true;
			},
		});
		expect(outcome).toMatchObject({
			refreshed: true,
			committed: true,
			failed: [],
			paths: [GENERATED],
		});
		expect(git(root, 'status', '--porcelain')).toBe('');
		expect(git(root, 'log', '-1', '--format=%s')).toBe(
			'chore(generated): recompute after a merge',
		);
		expect(readFileSync(join(root, GENERATED), 'utf8')).toBe('count: 2\n');
	});

	it('commits nothing when the generators agree with the tree', () => {
		const root = repo();
		const before = git(root, 'rev-parse', 'HEAD');
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: () => true,
		});
		expect(outcome).toMatchObject({ refreshed: true, committed: false });
		expect(outcome.paths).toEqual([]);
		expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
	});

	it('never sweeps in work that is not generated, even when it is already staged', () => {
		const root = repo();
		writeFileSync(join(root, 'authored.ts'), 'export const a = 2;\n');
		// The previous test only left it dirty. An agent that had already
		// run `git add` would have had its work absorbed by a `git commit`
		// with no paths — the promise of isolation, broken quietly.
		execFileSync('git', ['add', 'authored.ts'], { cwd: root });
		refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 3\n');
				return true;
			},
		});
		// The generated file landed; the authored edit is still the
		// author's to commit.
		expect(git(root, 'show', '--name-only', '--format=', 'HEAD')).toBe(
			GENERATED,
		);
		expect(git(root, 'status', '--porcelain')).toContain('authored.ts');
	});

	it('reports a generator that failed and commits nothing of its own', () => {
		const root = repo();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: () => false,
		});
		expect(outcome.failed.length).toBeGreaterThan(0);
		expect(outcome.committed).toBe(false);
	});

	it('resolves the whole path, not one character short', () => {
		// The first real run staged `ocs/delendai/…` and reported nothing
		// to commit while the file sat dirty: the porcelain status was
		// being sliced by column position.
		const root = repo();
		const outcome = refreshGeneratedAfterMerge({
			root,
			paths: GENERATED_REFRESH_PATHS,
			run: (_command, cwd) => {
				writeFileSync(join(cwd, GENERATED), 'count: 4\n');
				return true;
			},
		});
		expect(outcome.paths).toEqual([GENERATED]);
		expect(outcome.paths[0]?.startsWith('docs/')).toBe(true);
	});
});
