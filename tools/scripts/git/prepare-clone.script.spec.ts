/**
 * prepare-clone.script.spec.ts — a linked worktree never rewrites the
 * configuration its clone shares.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isLinkedWorktree, PREPARE_STEPS } from './prepare-clone.script';

const SCRIPT = resolve(import.meta.dirname, 'prepare-clone.script.ts');
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repoWithWorktree = () => {
	const root = mkdtempSync(join(tmpdir(), 'prepare-clone-'));
	const linked = mkdtempSync(join(tmpdir(), 'prepare-clone-linked-'));
	dirs.push(root, linked);
	rmSync(linked, { recursive: true, force: true });
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'p@example.com');
	git(root, 'config', 'user.name', 'P');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'worktree', 'add', '-q', '--detach', linked);
	return { root, linked };
};

describe('which checkout sets the clone up', () => {
	it('tells a linked worktree from the main checkout', () => {
		const { root, linked } = repoWithWorktree();
		expect(isLinkedWorktree(root)).toBe(false);
		expect(isLinkedWorktree(linked)).toBe(true);
	});

	it('treats a directory outside any repository as not linked', () => {
		const outside = mkdtempSync(join(tmpdir(), 'prepare-clone-outside-'));
		dirs.push(outside);
		expect(isLinkedWorktree(outside)).toBe(false);
	});

	it('writes nothing to the shared configuration from a linked worktree', () => {
		const { root, linked } = repoWithWorktree();
		const before = git(root, 'config', '--list', '--local');
		const out = execFileSync('bun', [SCRIPT], {
			cwd: linked,
			encoding: 'utf8',
		});
		expect(out).toContain('the main checkout sets it up');
		expect(git(root, 'config', '--list', '--local')).toBe(before);
	});
});

describe('what the main checkout runs', () => {
	it('keeps the steps the prepare chain always ran, in their order', () => {
		expect(PREPARE_STEPS.map((step) => step.join(' '))).toEqual([
			'bun tools/scripts/git/clone-hygiene.script.ts',
			'bun tools/scripts/sync-git-hooks.script.ts',
			'lefthook install',
			'bun tools/scripts/git/harden-git-hooks.script.ts',
			'bun packages/cli/src/index.ts --workspace=. guard install --alongside-manager',
		]);
	});
});
