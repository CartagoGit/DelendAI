/**
 * worktree-husks.service.spec.ts — a directory beside the units that is
 * no unit is removed, and what it held is kept first.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	huskDirectories,
	husksInvariant,
	reapHusks,
} from '@delendai/core/lib/work-units/worktree-husks.service';

const UNITS = '.cache/delendai/.worktrees';
const WINDOW = 60;
const LATER = Math.floor(Date.now() / 1000) + 3600;

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository with a forge beside it and one unit in its worktree. */
const repo = (): { root: string; forge: string } => {
	const base = mkdtempSync(join(tmpdir(), 'husks-'));
	roots.push(base);
	const forge = join(base, 'forge.git');
	const root = join(base, 'repo');
	mkdirSync(root);
	git(base, 'init', '-q', '--bare', forge);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(join(root, '.gitignore'), '.cache/\nnode_modules/\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', forge);
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'worktree', 'add', '-q', '-b', 'unit', join(root, UNITS, 'unit'));
	return { root, forge };
};

const write = (root: string, path: string, content: string): void => {
	const file = join(root, UNITS, path);
	mkdirSync(join(file, '..'), { recursive: true });
	writeFileSync(file, content);
};

const reap = (root: string, apply: boolean, now = LATER) =>
	reapHusks({
		root,
		remote: 'origin',
		namespace: 'delendai',
		windowSeconds: WINDOW,
		apply,
		now,
	});

describe('a directory beside the units', () => {
	it('is a husk when git has no worktree for it, and a unit is not', async () => {
		const { root } = repo();
		write(root, 'gone/.cache/results/validate.jsonl', '{}\n');

		const husks = await huskDirectories({ root, now: LATER });

		expect(husks.map((husk) => husk.name)).toEqual(['gone']);
		expect(husksInvariant(husks, WINDOW).holds).toBe(false);
		expect(husksInvariant(husks, WINDOW).observed).toBe('1: gone');
	});

	it('is not counted while something is still writing to it', async () => {
		const { root } = repo();
		write(root, 'gone/.cache/results/validate.jsonl', '{}\n');
		const now = Math.floor(Date.now() / 1000);

		const husks = await huskDirectories({ root, now });

		expect(husksInvariant(husks, WINDOW).holds).toBe(true);
		expect(await reap(root, true, now)).toEqual([]);
		expect(existsSync(join(root, UNITS, 'gone'))).toBe(true);
	});

	it('is only reported until the reap is applied', async () => {
		const { root } = repo();
		write(root, 'gone/.cache/results/validate.jsonl', '{}\n');

		const [reported] = await reap(root, false);

		expect(reported?.outcome).toBe('would-remove');
		expect(existsSync(join(root, UNITS, 'gone'))).toBe(true);
	});

	it('goes when it holds only what git ignores, and nothing is kept', async () => {
		const { root, forge } = repo();
		write(root, 'gone/.cache/results/validate.jsonl', '{}\n');
		write(root, 'gone/plugins/a/node_modules/x/index.js', '\n');

		const [reaped] = await reap(root, true);

		expect(reaped).toMatchObject({ outcome: 'removed', keptAt: [] });
		expect(existsSync(join(root, UNITS, 'gone'))).toBe(false);
		expect(existsSync(join(root, UNITS, 'unit'))).toBe(true);
		expect(git(forge, 'for-each-ref', 'refs/delendai')).toBe('');
	});

	it('keeps nothing of a checkout whose files a commit already has', async () => {
		const { root, forge } = repo();
		const inner = 'gone/.cache/.worktrees/inner';
		write(root, `${inner}/.git`, 'gitdir: /nowhere/any/more\n');
		write(root, `${inner}/README.md`, '# repo\n');
		write(root, `${inner}/.gitignore`, '.cache/\nnode_modules/\n');

		const [reaped] = await reap(root, true);

		expect(reaped).toMatchObject({ outcome: 'removed', keptAt: [] });
		expect(git(forge, 'for-each-ref', 'refs/delendai')).toBe('');
	});

	it('keeps on the forge the files of a checkout no commit has, then goes', async () => {
		const { root, forge } = repo();
		const inner = 'gone/.cache/.worktrees/inner';
		write(root, `${inner}/.git`, 'gitdir: /nowhere/any/more\n');
		write(
			root,
			`${inner}/README.md`,
			'# repo\n\nA verdict never committed.\n',
		);
		write(root, `${inner}/node_modules/x/index.js`, '\n');

		const [reaped] = await reap(root, true);

		const kept = 'refs/delendai/retired/husk/gone--inner';
		expect(reaped).toMatchObject({ outcome: 'removed', keptAt: [kept] });
		expect(existsSync(join(root, UNITS, 'gone'))).toBe(false);
		expect(git(forge, 'show', `${kept}:README.md`)).toContain(
			'A verdict never committed.',
		);
		expect(git(forge, 'ls-tree', '-r', '--name-only', kept)).toBe(
			'README.md',
		);
	});

	it('keeps a checkout that is not under an ignored path apart from the husk around it', async () => {
		const { root, forge } = repo();
		write(root, 'gone/notes.md', 'left by somebody\n');
		write(root, 'gone/inner/.git', 'gitdir: /nowhere/any/more\n');
		write(root, 'gone/inner/work.md', 'never committed\n');

		const [reaped] = await reap(root, true);

		expect(reaped?.outcome).toBe('removed');
		expect(reaped?.keptAt).toEqual([
			'refs/delendai/retired/husk/gone',
			'refs/delendai/retired/husk/gone--inner',
		]);
		expect(
			git(forge, 'ls-tree', '-r', '--name-only', reaped?.keptAt[0] ?? ''),
		).toBe('notes.md');
	});

	it('stays, and says why, when the forge does not take its files', async () => {
		const { root } = repo();
		write(root, 'gone/notes.md', 'left by somebody\n');
		git(root, 'remote', 'set-url', 'origin', join(root, 'no-such-forge'));

		const [reaped] = await reap(root, true);

		expect(reaped).toMatchObject({
			outcome: 'kept',
			reason: '`origin` did not accept its files',
		});
		expect(existsSync(join(root, UNITS, 'gone', 'notes.md'))).toBe(true);
	});
});
