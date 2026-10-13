/**
 * proposal-id-sources.spec.ts — an id is taken if ANY checkout of the
 * clone or any remote ref already holds it, not only this tree.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IAllocatorFs } from '@delendai/proposals/lib/proposals/proposal-id-allocator-fs';
import {
	countersFromNames,
	countersFromReservations,
	createGitProposalIdSources,
	worktreePathsFrom,
} from '@delendai/proposals/lib/proposals/proposal-id-sources';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const fakeGit =
	(answers: Readonly<Record<string, string | null>>): IGitRunner =>
	async (args) => {
		const key = args.join(' ');
		const hit = Object.entries(answers).find(([prefix]) =>
			key.startsWith(prefix),
		);
		if (hit === undefined || hit[1] === null) {
			return { ok: false, output: '', reason: `no answer for: ${key}` };
		}
		return { ok: true, output: hit[1] };
	};

const fakeFs = (
	dirs: Readonly<Record<string, readonly string[]>>,
): IAllocatorFs => ({
	read: async () => null,
	list: async (path) =>
		(dirs[path] ?? []).map((name) => ({ name, isFile: true })),
});

describe('countersFromNames', () => {
	it('keeps the highest id per prefix, from bare names or paths', () => {
		expect(
			countersFromNames([
				'f00539-configurable-ci-pr-policy.md',
				'docs/delendai/proposals/ready/feats/f00546-repo-format-adapters.md',
				'x00544-plugin-path-inputs.md',
				'README.md',
				'notes.txt',
			]),
		).toEqual({ f: 546, x: 544 });
	});
});

describe('worktreePathsFrom', () => {
	it('reads every worktree path from porcelain output', () => {
		expect(
			worktreePathsFrom(
				[
					'worktree /repo',
					'HEAD abc',
					'branch refs/heads/develop',
					'',
					'worktree /repo/.cache/delendai/.worktrees/work-a',
					'HEAD def',
					'detached',
				].join('\n'),
			),
		).toEqual(['/repo', '/repo/.cache/delendai/.worktrees/work-a']);
	});
});

describe('createGitProposalIdSources', () => {
	const proposalsDirAbs =
		'/repo/.cache/delendai/.worktrees/work-a/docs/delendai/proposals';

	it('shares one counter under the git common directory', async () => {
		const sources = createGitProposalIdSources(proposalsDirAbs, {
			git: fakeGit({
				'rev-parse --path-format=absolute --git-common-dir':
					'/repo/.git\n',
			}),
			fs: fakeFs({}),
		});

		expect(await sources.sharedCounterPath()).toBe(
			'/repo/.git/delendai/proposal-id-counters.json',
		);
	});

	it('sees another agent’s untracked proposal in a sibling worktree and one on a remote ref', async () => {
		const sources = createGitProposalIdSources(proposalsDirAbs, {
			git: fakeGit({
				'rev-parse --show-toplevel':
					'/repo/.cache/delendai/.worktrees/work-a\n',
				'worktree list --porcelain':
					'worktree /repo\nHEAD a\n\nworktree /repo/.cache/delendai/.worktrees/work-a\nHEAD b\n',
				'for-each-ref':
					'refs/remotes/origin/develop\nrefs/remotes/origin/delendai/pr/x\n',
				'ls-tree -r --full-tree --name-only refs/remotes/origin/develop':
					'docs/delendai/proposals/ready/fixes/x00544-a.md\n',
				'ls-tree -r --full-tree --name-only refs/remotes/origin/delendai/pr/x':
					'docs/delendai/proposals/ready/fixes/x00545-b.md\n',
			}),
			fs: fakeFs({
				// The main checkout, where another agent is still writing.
				'/repo/docs/delendai/proposals/ready/feats': [
					'f00546-still-being-written.md',
				],
			}),
		});

		expect(await sources.elsewhere()).toEqual({ f: 546, x: 545 });
	});

	it('knows nothing outside a repository, so the allocator behaves as before', async () => {
		const sources = createGitProposalIdSources(proposalsDirAbs, {
			git: fakeGit({}),
			fs: fakeFs({}),
		});

		expect(await sources.sharedCounterPath()).toBeNull();
		expect(await sources.elsewhere()).toEqual({});
	});
});

describe('countersFromReservations', () => {
	it('keeps the highest reserved id per prefix', () => {
		expect(
			countersFromReservations(
				[
					'a1\trefs/delendai/ids/x00811',
					'b2\trefs/delendai/ids/x00850',
					'c3\trefs/delendai/ids/f00040',
					'd4\trefs/heads/x00999',
				].join('\n'),
			),
		).toEqual({ x: 850, f: 40 });
	});
});

describe('createGitProposalIdSources against a real repository', () => {
	const repos: string[] = [];
	afterEach(() => {
		for (const repo of repos.splice(0)) {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' });

	it('sees an id held on a remote ref from inside the proposals directory', async () => {
		// The CLI's server runs with the proposals directory as its cwd,
		// where `ls-tree` read a repository-relative pathspec as relative
		// to that directory and matched nothing: the id held by another
		// agent's published branch was invisible to it, and visible to the
		// MCP server running at the repository root.
		const repo = mkdtempSync(join(tmpdir(), 'delendai-id-sources-'));
		repos.push(repo);
		git(repo, 'init', '-q', '-b', 'develop');
		const folder = join(repo, 'docs', 'delendai', 'proposals', 'ready');
		mkdirSync(folder, { recursive: true });
		writeFileSync(join(folder, 'x00900-held-elsewhere.md'), '# held\n');
		git(repo, 'add', '.');
		git(
			repo,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'--no-verify',
			'-qm',
			'held',
		);
		git(repo, 'update-ref', 'refs/remotes/origin/other', 'HEAD');
		rmSync(join(repo, 'docs'), { recursive: true, force: true });
		const proposalsDir = join(repo, 'docs', 'delendai', 'proposals');
		mkdirSync(proposalsDir, { recursive: true });

		const sources = createGitProposalIdSources(proposalsDir);

		expect((await sources.elsewhere()).x).toBe(900);
	});

	const cloneWithRemote = (): {
		readonly clone: string;
		readonly remote: string;
	} => {
		const base = mkdtempSync(join(tmpdir(), 'delendai-id-reserve-'));
		repos.push(base);
		const remote = join(base, 'remote.git');
		const clone = join(base, 'clone');
		mkdirSync(clone, { recursive: true });
		git(base, 'init', '-q', '--bare', '-b', 'develop', remote);
		git(clone, 'init', '-q', '-b', 'develop');
		writeFileSync(join(clone, 'README.md'), '# project\n');
		git(clone, 'add', '.');
		git(
			clone,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'--no-verify',
			'-qm',
			'base',
		);
		git(clone, 'remote', 'add', 'origin', remote);
		git(clone, 'push', '-q', '--no-verify', 'origin', 'develop');
		mkdirSync(join(clone, 'docs', 'delendai', 'proposals'), {
			recursive: true,
		});
		return { clone, remote };
	};

	it('hands an id to exactly one of two clones that reserve it', async () => {
		const { clone, remote } = cloneWithRemote();
		const second = join(clone, '..', 'second');
		git(clone, 'clone', '-q', remote, second);
		mkdirSync(join(second, 'docs', 'delendai', 'proposals'), {
			recursive: true,
		});
		const a = createGitProposalIdSources(
			join(clone, 'docs/delendai/proposals'),
		);
		const b = createGitProposalIdSources(
			join(second, 'docs/delendai/proposals'),
		);

		const first = await a.reserve('x00811');
		const again = await b.reserve('x00811');
		const other = await b.reserve('x00812');

		expect(first).toBe('reserved');
		expect(again).toBe('taken');
		expect(other).toBe('reserved');
		expect((await a.elsewhere()).x).toBe(812);
	});

	it('releases the reservations a higher one supersedes, and only those', async () => {
		const { clone, remote } = cloneWithRemote();
		const sources = createGitProposalIdSources(
			join(clone, 'docs/delendai/proposals'),
		);
		expect(await sources.reserve('x00811')).toBe('reserved');
		expect(await sources.reserve('f00811')).toBe('reserved');
		expect(await sources.reserve('x00812')).toBe('reserved');
		const left = git(clone, 'ls-remote', remote, 'refs/delendai/ids/*')
			.split('\n')
			.map((line) => line.split('\t')[1])
			.filter((ref) => ref !== undefined)
			.sort();
		expect(left).toEqual([
			'refs/delendai/ids/f00811',
			'refs/delendai/ids/x00812',
		]);
		expect((await sources.elsewhere()).x).toBe(812);
	});

	it('says nothing could be decided when there is no remote', async () => {
		const { clone } = cloneWithRemote();
		git(clone, 'remote', 'remove', 'origin');

		expect(
			await createGitProposalIdSources(
				join(clone, 'docs/delendai/proposals'),
			).reserve('x00811'),
		).toBe('unavailable');
	});
});
