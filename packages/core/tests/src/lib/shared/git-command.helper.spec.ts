/**
 * git-command.helper.spec.ts — the one synchronous git command reports
 * git's own words when it fails, and keeps a hook's index out of it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runGitCommand } from '@delendai/core/lib/shared/git-command.helper';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
	delete process.env.GIT_INDEX_FILE;
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'git-command-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
	return root;
};

describe('runGitCommand', () => {
	it('answers stdout when git succeeds and its stderr when it fails', () => {
		const root = repo();
		expect(
			runGitCommand(root, ['rev-parse', '--is-inside-work-tree']),
		).toEqual({
			ok: true,
			out: 'true',
		});
		const failed = runGitCommand(root, [
			'rev-parse',
			'--verify',
			'nowhere',
		]);
		expect(failed.ok).toBe(false);
		expect(failed.out.length).toBeGreaterThan(0);
	});

	it('adds the variables it is given', () => {
		const root = repo();
		expect(
			runGitCommand(root, ['var', 'GIT_AUTHOR_IDENT'], {
				env: {
					GIT_AUTHOR_NAME: 'Probe',
					GIT_AUTHOR_EMAIL: 'p@example.com',
				},
			}).out,
		).toMatch(/^Probe <p@example\.com>/u);
	});

	it('drops a hook index when asked, even in the hook worktree', () => {
		const root = repo();
		process.env.GIT_INDEX_FILE = join(root, 'no-such-dir', 'index');
		expect(runGitCommand(root, ['ls-files'], { hookFree: true }).ok).toBe(
			true,
		);
	});
});
