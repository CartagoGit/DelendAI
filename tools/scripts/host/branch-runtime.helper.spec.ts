/**
 * branch-runtime.helper.spec.ts — against real repositories: what matters is
 * which commit ends up running, and that the checkout does not move.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	branchFlag,
	branchHostScript,
	withoutBranchFlag,
} from './branch-runtime.helper';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{ cwd, encoding: 'utf8' },
	).trim();

/** A checkout on develop, with a main that holds one more file. */
const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'branch-runtime-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'main');
	mkdirSync(join(root, 'tools/scripts/host'), { recursive: true });
	writeFileSync(join(root, 'tools/scripts/host/host-server.script.ts'), '1');
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'one');
	git(root, 'switch', '-qc', 'develop');
	return root;
};

const noInstall: Parameters<typeof branchHostScript>[2] = (
	command,
	args,
	cwd,
) => {
	if (command !== 'git') return '';
	try {
		return execFileSync(command, [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

describe('the branch flag', () => {
	it('reads the branch, with or without quotes', () => {
		expect(branchFlag(['--branch=main'])).toBe('main');
		expect(branchFlag(['--branch="main"'])).toBe('main');
		expect(branchFlag(['--workspace=.'])).toBeUndefined();
		expect(branchFlag(['--branch='])).toBeUndefined();
	});

	it('is not passed on to the host', () => {
		expect(withoutBranchFlag(['--workspace=.', '--branch=main'])).toEqual([
			'--workspace=.',
		]);
	});
});

describe('branchHostScript', () => {
	it('runs the branch from its own tree and leaves the checkout alone', async () => {
		const root = repo();
		const script = await branchHostScript(root, 'main', noInstall);
		expect(script).toContain('.cache/delendai/branch-runtime/main/');
		expect(git(root, 'branch', '--show-current')).toBe('develop');
	});

	it('follows the branch on the next start', async () => {
		const root = repo();
		await branchHostScript(root, 'main', noInstall);
		git(root, 'switch', '-q', '--ignore-other-worktrees', 'main');
		writeFileSync(join(root, 'new.txt'), 'x');
		git(root, 'add', 'new.txt');
		git(root, 'commit', '-qm', 'two');
		const tip = git(root, 'rev-parse', 'HEAD');
		git(root, 'switch', '-q', 'develop');
		const script = (await branchHostScript(root, 'main', noInstall)) ?? '';
		const tree = script.replace(
			'/tools/scripts/host/host-server.script.ts',
			'',
		);
		expect(git(tree, 'rev-parse', 'HEAD')).toBe(tip);
	});

	it('gives each branch its own tree, and one tree to two starts', async () => {
		const root = repo();
		git(root, 'branch', 'other');
		const [main, again, other] = await Promise.all([
			branchHostScript(root, 'main', noInstall),
			branchHostScript(root, 'main', noInstall),
			branchHostScript(root, 'other', noInstall),
		]);
		expect(main).toBe(again);
		expect(other).toContain('branch-runtime/other/');
	});

	it('answers nothing for a branch that does not exist', async () => {
		expect(
			await branchHostScript(repo(), 'nope', noInstall),
		).toBeUndefined();
	});

	it('refuses a name that could be read as an option', async () => {
		expect(
			await branchHostScript(repo(), '--upload-pack=x', noInstall),
		).toBeUndefined();
	});
});
