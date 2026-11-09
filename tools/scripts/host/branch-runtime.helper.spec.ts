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
	branchLabel,
	malformedVersionReason,
	nearestReleaseTags,
	npmVersionHostScript,
	releaseTag,
	runtimePin,
	runtimeReport,
	versionFlag,
	versionHostScript,
	withoutBranchFlag,
	withoutRuntimeFlags,
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

describe('a pinned release', () => {
	it('runs the tag from its own tree, whatever the checkout holds', async () => {
		const root = repo();
		git(root, 'tag', releaseTag('0.3.0'));
		writeFileSync(join(root, 'later.txt'), 'x');
		git(root, 'add', 'later.txt');
		git(root, 'commit', '-qm', 'later');
		const resolved = await versionHostScript(root, '0.3.0', noInstall);
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.script).toContain('branch-runtime/release@v0.3.0/');
		const tree = resolved.script.replace(
			'/tools/scripts/host/host-server.script.ts',
			'',
		);
		expect(git(tree, 'rev-parse', 'HEAD')).toBe(
			git(root, 'rev-parse', 'v0.3.0^{commit}'),
		);
		expect(git(root, 'branch', '--show-current')).toBe('develop');
		expect(resolved.label).toContain('release v0.3.0');
	});

	it('refuses a version with no tag, naming the nearest tags', async () => {
		const root = repo();
		for (const v of ['0.1.0', '0.2.0', '0.3.0', '0.4.0'])
			git(root, 'tag', releaseTag(v));
		const resolved = await versionHostScript(root, '0.2.5', noInstall);
		expect(resolved).toMatchObject({ ok: false });
		const reason = resolved.ok ? '' : resolved.reason;
		expect(reason).toContain('0.2.5');
		expect(reason).toContain('v0.2.0, v0.3.0');
		expect(
			nearestReleaseTags('0.2.5', [
				'v0.1.0',
				'v0.2.0',
				'v0.3.0',
				'v0.4.0',
				'x',
			]),
		).toEqual(['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.4.0']);
	});

	it('[<50ms] refuses both flags together, and a malformed version', () => {
		const both = runtimePin(['--branch=main', '--version=0.3.0']);
		expect(both.kind).toBe('refused');
		expect(both.kind === 'refused' && both.reason).toContain('together');
		for (const bad of ['', '0.3', 'v0.3.0', 'latest', '0.3.0; rm'])
			expect(runtimePin([`--version=${bad}`])).toEqual({
				kind: 'malformed-version',
				version: bad,
			});
		expect(runtimePin(['--version=0.3.0'])).toEqual({
			kind: 'version',
			version: '0.3.0',
		});
		expect(runtimePin(['--branch=main'])).toEqual({
			kind: 'branch',
			branch: 'main',
		});
		expect(runtimePin(['--workspace=.'])).toEqual({ kind: 'checkout' });
	});

	it('[<1000ms] refuses a malformed version, naming the newest tags that exist', () => {
		const root = repo();
		for (const v of ['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0'])
			git(root, 'tag', releaseTag(v));
		const reason = malformedVersionReason(root, 'latest', noInstall);
		expect(reason).toContain('"latest"');
		expect(reason).toContain('v0.2.0, v0.3.0, v0.4.0, v0.5.0');
		expect(reason).not.toContain('v0.1.0');
	});

	it('reads the flag and keeps it from the host', () => {
		expect(versionFlag(['--version="0.3.0"'])).toBe('0.3.0');
		expect(
			withoutRuntimeFlags([
				'--workspace=.',
				'--version=0.3.0',
				'--branch=x',
			]),
		).toEqual(['--workspace=.']);
	});

	it('reports what it runs at startup', async () => {
		const root = repo();
		const script = (await branchHostScript(root, 'main', noInstall)) ?? '';
		expect(branchLabel('main', script)).toMatch(
			/^branch main \([0-9a-f]{9}\)$/u,
		);
		expect(runtimeReport('release v0.3.0 (abc)')).toBe(
			'[delendai] running release v0.3.0 (abc)\n',
		);
	});

	it('from npm runs only the installed version, and says what is not wired', () => {
		const root = repo();
		writeFileSync(join(root, 'package.json'), '{"version":"0.3.0"}');
		expect(npmVersionHostScript(root, '0.3.0', '/h').ok).toBe(true);
		const other = npmVersionHostScript(root, '0.2.0', '/h');
		expect(other.ok ? '' : other.reason).toContain('not wired yet');
	});
});
