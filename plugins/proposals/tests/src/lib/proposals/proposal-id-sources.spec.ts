/**
 * proposal-id-sources.spec.ts — an id is taken if ANY checkout of the
 * clone or any remote ref already holds it, not only this tree.
 */
import { describe, expect, it } from 'vitest';

import type { IAllocatorFs } from '@delendai/proposals/lib/proposals/proposal-id-allocator-fs';
import {
	countersFromNames,
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
				'ls-tree -r --name-only refs/remotes/origin/develop':
					'docs/delendai/proposals/ready/fixes/x00544-a.md\n',
				'ls-tree -r --name-only refs/remotes/origin/delendai/pr/x':
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
