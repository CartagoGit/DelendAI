import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSetupMaterialiser } from './integration-rehearsal-setup.helper';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('the rehearsal setup materialiser', () => {
	let repo = '';
	let base = '';

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), 'setup-materialiser-'));
		git(repo, 'init', '-q');
		writeFileSync(join(repo, 'settings.txt'), 'old\n');
		writeFileSync(join(repo, 'gone.txt'), 'bye\n');
		git(repo, 'add', '-A');
		git(
			repo,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-q',
			'-m',
			'base',
		);
		base = git(repo, 'rev-parse', 'HEAD');
	});

	afterEach(() => rmSync(repo, { recursive: true, force: true }));

	it('[<2000ms] returns only the files the command changed, over the rehearsal files, and leaves no worktree', async () => {
		const changed = await createSetupMaterialiser(repo, base)(
			'echo new > settings.txt && echo made > made.txt && rm gone.txt',
			[{ path: 'rehearsal/own.txt', content: 'mine' }],
		);
		expect(
			[...changed].sort((a, b) => a.path.localeCompare(b.path)),
		).toEqual([
			{ path: 'gone.txt', content: null },
			{ path: 'made.txt', content: 'made\n' },
			{ path: 'settings.txt', content: 'new\n' },
		]);
		expect(git(repo, 'worktree', 'list').split('\n')).toHaveLength(1);
		expect(existsSync(join(repo, 'made.txt'))).toBe(false);
	});

	it('[<2000ms] fails naming the command when it fails', async () => {
		await expect(
			createSetupMaterialiser(repo, base)('echo broke >&2; exit 3', []),
		).rejects.toThrow(
			'the rehearsal setup command `echo broke >&2; exit 3` failed: broke',
		);
		expect(git(repo, 'worktree', 'list').split('\n')).toHaveLength(1);
	});
});
