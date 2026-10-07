/**
 * work-unit-profiles.spec.ts — one unit-of-work mechanism per profile.
 *
 * `worktree-pr` used to declare branch persistence while `work enter`,
 * `work checkpoint` and `work publish` (which are profile-blind) required
 * a work ref, and `agent_worktree` made `agent/*` branches none of them
 * accept. Real git, each profile: the worktree and branch `work enter`
 * makes are the ones `checkpoint` and `publish` take, and publish
 * produces the publication ref.
 */
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: true, remote: undefined }),
	});

/** A repository on `profile`, with an origin that accepts pushes. */
const repoOn = (profile: string): string => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'work-prof-')));
	const remote = mkdtempSync(join(tmpdir(), 'work-prof-remote-'));
	roots.push(root, remote);
	execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile,
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	return root;
};

const SSH_ORIGIN = 'git@github.com:Example/Repo.git';

/**
 * A `gh` first on PATH that records what it was asked and answers like a
 * forge with no open pull request.
 */
const fakeForgeCli = (): { readonly log: string; restore: () => void } => {
	const dir = mkdtempSync(join(tmpdir(), 'work-prof-gh-'));
	roots.push(dir);
	const log = join(dir, 'calls.log');
	const script = join(dir, 'gh');
	writeFileSync(
		script,
		[
			'#!/bin/sh',
			`echo "$@" >> "${log}"`,
			'case "$1 $2" in',
			'"pr create") echo https://github.com/Example/Repo/pull/1;;',
			'esac',
			'exit 0',
			'',
		].join('\n'),
	);
	chmodSync(script, 0o755);
	const before = process.env.PATH;
	process.env.PATH = `${dir}:${before ?? ''}`;
	return {
		log,
		restore: () => {
			process.env.PATH = before;
		},
	};
};

/**
 * An ssh transport that runs the remote command against `bare` instead of
 * a host, so an ssh-style origin can be pushed to and read back locally.
 */
const fakeSshTransport = (bare: string): { restore: () => void } => {
	const dir = mkdtempSync(join(tmpdir(), 'work-prof-ssh-'));
	roots.push(dir);
	const script = join(dir, 'ssh');
	writeFileSync(
		script,
		[
			'#!/bin/sh',
			'for last in "$@"; do :; done',
			`exec sh -c "$(printf '%s' "$last" | sed "s#'Example/Repo.git'#'${bare}'#")"`,
			'',
		].join('\n'),
	);
	chmodSync(script, 0o755);
	const before = process.env.GIT_SSH_COMMAND;
	process.env.GIT_SSH_COMMAND = script;
	return {
		restore: () => {
			if (before === undefined) delete process.env.GIT_SSH_COMMAND;
			else process.env.GIT_SSH_COMMAND = before;
		},
	};
};

const UNIT = [
	'--proposal=x1',
	'--slice=S1',
	'--agent=claude-sonnet-5-5',
	'--topic=probe',
] as const;

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe.each(['shared-checkout-pr', 'worktree-pr'])(
	'work units under %s',
	(profile) => {
		it('enter makes a worktree on the work ref, which publish turns into the publication ref', async () => {
			const root = repoOn(profile);
			const entered = await runWorkUnit(
				['enter', ...UNIT],
				contextFor(root),
			);
			expect(entered.code).toBe(0);
			const data = entered.data as {
				readonly path: string;
				readonly branch: string;
			};
			expect(data.branch).toBe(
				'delendai/wip/claude-sonnet-5-5/implement/x1-S1-g1/probe',
			);
			expect(existsSync(data.path)).toBe(true);
			expect(git(data.path, 'symbolic-ref', '--short', 'HEAD')).toBe(
				data.branch,
			);
			// The shared checkout never moved.
			expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe(
				'develop',
			);

			writeFileSync(join(data.path, 'a.ts'), 'export const a = 1;\n');
			git(data.path, 'add', 'a.ts');
			git(data.path, 'commit', '-q', '-m', 'feat: a');

			const published = await runWorkUnit(
				['publish', ...UNIT],
				contextFor(root),
			);
			expect(published.code).toBe(0);
			expect(published.data).toMatchObject({ published: true });
			expect(
				git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/**'),
			).toContain(
				'refs/heads/delendai/pr/claude-sonnet-5-5/implement/x1-S1-g1/probe',
			);
		});

		it('checkpoint from the shared checkout takes the unit that enter made', async () => {
			const root = repoOn(profile);
			await runWorkUnit(['enter', ...UNIT], contextFor(root));
			// A shared checkout is pinned to develop and checkpoints from
			// there, without moving HEAD.
			writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');
			const result = await runWorkUnit(
				['checkpoint', ...UNIT, '--paths=b.ts', '--message=feat: b'],
				contextFor(root),
			);
			expect(result.code).toBe(0);
			expect(result.data).toMatchObject({
				status: 'created',
				ref: 'refs/heads/delendai/wip/claude-sonnet-5-5/implement/x1-S1-g1/probe',
			});
		});

		it('checkpoint from inside the unit worktree is refused and leaves it exactly as it was', async () => {
			const root = repoOn(profile);
			const entered = await runWorkUnit(
				['enter', ...UNIT],
				contextFor(root),
			);
			const { path, branch } = entered.data as {
				readonly path: string;
				readonly branch: string;
			};
			writeFileSync(join(path, 'b.ts'), 'export const b = 1;\n');
			const headBefore = git(path, 'rev-parse', 'HEAD');
			const result = await runWorkUnit(
				['checkpoint', ...UNIT, '--paths=b.ts', '--message=feat: b'],
				contextFor(path),
			);
			expect(result.code).not.toBe(0);
			expect(result.error).toContain('Commit here with git');
			expect(git(path, 'rev-parse', 'HEAD')).toBe(headBefore);
			expect(git(root, 'rev-parse', branch)).toBe(headBefore);
			// Only the file the agent wrote is untracked: no phantom edits.
			expect(git(path, 'status', '--porcelain')).toBe('?? b.ts');
		});

		it('publish from inside the unit worktree removes it and opens the pull request of an ssh-style origin', async () => {
			const root = repoOn(profile);
			// The remote is the GitHub ssh URL, reached through a transport
			// that serves the bare repository, as a forge-backed clone is.
			const ssh = fakeSshTransport(
				git(root, 'remote', 'get-url', 'origin'),
			);
			git(root, 'remote', 'set-url', 'origin', SSH_ORIGIN);
			const entered = await runWorkUnit(
				['enter', ...UNIT],
				contextFor(root),
			);
			const { path } = entered.data as { readonly path: string };
			writeFileSync(join(path, 'a.ts'), 'export const a = 1;\n');
			git(path, 'add', 'a.ts');
			git(path, 'commit', '-q', '-m', 'feat: a');

			const forge = fakeForgeCli();
			const published = await runWorkUnit(
				['publish', ...UNIT],
				contextFor(path),
			);
			forge.restore();
			ssh.restore();
			expect(published.code).toBe(0);
			expect(existsSync(path)).toBe(false);
			expect(git(root, 'branch', '--list', 'delendai/wip/*')).toBe('');
			expect(published.data).toMatchObject({
				pullRequest: { status: 'opened' },
			});
			expect(readFileSync(forge.log, 'utf8')).toContain('pr create');
		});

		it('names the URL it saw when the remote is not GitHub, and never invites opening the pull request by hand', async () => {
			const root = repoOn(profile);
			const entered = await runWorkUnit(
				['enter', ...UNIT],
				contextFor(root),
			);
			const { path } = entered.data as { readonly path: string };
			writeFileSync(join(path, 'a.ts'), 'export const a = 1;\n');
			git(path, 'add', 'a.ts');
			git(path, 'commit', '-q', '-m', 'feat: a');
			const published = await runWorkUnit(
				['publish', ...UNIT],
				contextFor(path),
			);
			const skipped = (
				published.data as {
					readonly pullRequest: {
						readonly status: string;
						readonly reason: string;
					};
				}
			).pullRequest;
			expect(skipped.status).toBe('skipped');
			expect(skipped.reason).toContain(
				git(root, 'remote', 'get-url', 'origin'),
			);
			expect(skipped.reason).toContain('machine that holds the forge');
			expect(skipped.reason).not.toMatch(/open the pull request of/u);
		});
	},
);
