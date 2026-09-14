/**
 * merge-commit.spec.ts — the plumbing merge, against real git.
 *
 * `mergeCommit` is the one operation in this port that WRITES history,
 * and its whole promise is that it does so without touching the working
 * tree: the merge model exists for projects whose agents share one
 * checkout, and a `git merge` there moves HEAD and rewrites files
 * somebody else is editing.
 *
 * Driven against a real repository rather than a stubbed runner,
 * because every claim here is a claim about what git actually does with
 * `read-tree -m --aggressive` and `write-tree` — a fake would prove only
 * that the spec and the stub agree with each other. The conflict case
 * in particular rests on `write-tree` REFUSING an index that still has
 * conflict stages, which no mock can demonstrate.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createIntegrationGit } from '@delendai/core/lib/integration-engine/git-operations';

let root: string | undefined;

const git = (cwd: string, ...args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

const write = (dir: string, path: string, content: string): void => {
	writeFileSync(join(dir, path), content, 'utf8');
};

/** A repository with one base commit and two divergent branches. */
const repository = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'delendai-merge-spec-'));
	root = dir;
	git(dir, 'init', '--quiet', '--initial-branch', 'develop');
	git(dir, 'config', 'user.name', 'Test');
	git(dir, 'config', 'user.email', 'test@example.com');
	git(dir, 'config', 'commit.gpgsign', 'false');
	write(dir, 'a.txt', 'base\n');
	write(dir, 'b.txt', 'base\n');
	git(dir, 'add', '-A');
	git(dir, 'commit', '--quiet', '-m', 'base');
	return dir;
};

afterEach(() => {
	if (root !== undefined) rmSync(root, { recursive: true, force: true });
	root = undefined;
});

describe('mergeCommit', () => {
	it('merges disjoint changes and leaves the working tree untouched', async () => {
		const dir = repository();

		git(dir, 'checkout', '--quiet', '-b', 'work');
		write(dir, 'b.txt', 'from the work ref\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'work');
		const incoming = git(dir, 'rev-parse', 'HEAD');

		git(dir, 'checkout', '--quiet', 'develop');
		write(dir, 'a.txt', 'from integration\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'integration');
		const integration = git(dir, 'rev-parse', 'HEAD');

		// Something a human is editing, uncommitted. It must still be
		// here afterwards, byte for byte.
		write(dir, 'a.txt', 'SOMEBODY IS EDITING THIS\n');
		const headBefore = git(dir, 'rev-parse', 'HEAD');

		const port = await createIntegrationGit(dir);
		const result = await port?.mergeCommit({
			base: integration,
			incoming,
			message: 'merge work into develop',
		});

		expect(result?.kind).toBe('merged');
		if (result?.kind !== 'merged') throw new Error('expected a merge');

		// Two parents, in order: the merge carries the lineage of both.
		expect(git(dir, 'rev-list', '--parents', '-n', '1', result.sha)).toBe(
			`${result.sha} ${integration} ${incoming}`,
		);
		// The merged TREE has both changes, even though neither is in the
		// checkout right now.
		expect(git(dir, 'show', `${result.sha}:b.txt`)).toBe(
			'from the work ref',
		);

		// The whole promise of the port.
		expect(git(dir, 'rev-parse', 'HEAD')).toBe(headBefore);
		expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe(
			'SOMEBODY IS EDITING THIS\n',
		);
	});

	it('answers a real conflict with the paths, not with an exception', async () => {
		const dir = repository();

		git(dir, 'checkout', '--quiet', '-b', 'work');
		write(dir, 'a.txt', 'work says this\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'work edit');
		const incoming = git(dir, 'rev-parse', 'HEAD');

		git(dir, 'checkout', '--quiet', 'develop');
		write(dir, 'a.txt', 'integration says something else\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'integration edit');
		const integration = git(dir, 'rev-parse', 'HEAD');

		const port = await createIntegrationGit(dir);
		const result = await port?.mergeCommit({
			base: integration,
			incoming,
			message: 'merge work into develop',
		});

		// A human has to reconcile this; git is not broken. Only one of
		// those two is worth retrying, so they must not share a kind.
		expect(result?.kind).toBe('conflict');
		if (result?.kind !== 'conflict') throw new Error('expected a conflict');
		expect(result.paths).toContain('a.txt');
	});

	it('reports containment rather than writing an empty merge', async () => {
		const dir = repository();
		const base = git(dir, 'rev-parse', 'HEAD');

		git(dir, 'checkout', '--quiet', '-b', 'work');
		write(dir, 'b.txt', 'work\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'work');
		const incoming = git(dir, 'rev-parse', 'HEAD');

		git(dir, 'checkout', '--quiet', 'develop');
		git(dir, 'merge', '--quiet', '--no-edit', 'work');
		const integration = git(dir, 'rev-parse', 'HEAD');

		const port = await createIntegrationGit(dir);
		const result = await port?.mergeCommit({
			base: integration,
			incoming,
			message: 'merge work into develop',
		});

		// Already landed. Writing a merge here would add a commit that
		// changes nothing and make the cycle look like it did work.
		expect(result?.kind).toBe('up-to-date');
		expect(git(dir, 'rev-parse', 'HEAD')).toBe(integration);
		expect(base).not.toBe(integration);
	});

	it('does not leave its throwaway index behind', async () => {
		const dir = repository();
		git(dir, 'checkout', '--quiet', '-b', 'work');
		write(dir, 'b.txt', 'work\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'work');
		const incoming = git(dir, 'rev-parse', 'HEAD');
		git(dir, 'checkout', '--quiet', 'develop');
		const integration = git(dir, 'rev-parse', 'HEAD');

		const port = await createIntegrationGit(dir);
		await port?.mergeCommit({
			base: integration,
			incoming,
			message: 'merge',
		});

		// The index lives in the repository's own git directory, so a
		// leak would accumulate there rather than in a shared scratch
		// space where nobody would ever look.
		const gitDir = git(dir, 'rev-parse', '--absolute-git-dir');
		const leftovers = execFileSync(
			'sh',
			['-c', `ls ${gitDir} | grep -c delendai-merge || true`],
			{ encoding: 'utf8' },
		).trim();

		expect(leftovers).toBe('0');
	});
	it('answers an unknown revision with failed, not with a throw', async () => {
		const dir = repository();
		const integration = git(dir, 'rev-parse', 'HEAD');

		const port = await createIntegrationGit(dir);
		const result = await port?.mergeCommit({
			base: integration,
			incoming: 'refs/wip/nobody/never-existed',
			message: 'merge',
		});

		// The caller has to tell "this needs a human" from "git is
		// broken", and an exception erases that distinction by making
		// every cause look the same at the call site.
		expect(result?.kind).toBe('failed');
	});
});

describe('the rest of the port, against the same real repository', () => {
	it('resolves a revision it has and says nothing about one it does not', async () => {
		const dir = repository();
		const port = await createIntegrationGit(dir);

		expect(await port?.resolveRevision('HEAD')).toHaveLength(40);
		// `undefined`, not an empty string: a caller that treats "" as a
		// sha will happily compare-and-swap against nothing.
		expect(await port?.resolveRevision('refs/heads/never-existed')).toBe(
			undefined,
		);
	});

	it('answers containment in both directions', async () => {
		const dir = repository();
		const base = git(dir, 'rev-parse', 'HEAD');
		write(dir, 'c.txt', 'later\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'later');
		const later = git(dir, 'rev-parse', 'HEAD');

		const port = await createIntegrationGit(dir);

		expect(await port?.isAncestor(base, later)).toBe(true);
		expect(await port?.isAncestor(later, base)).toBe(false);
	});

	it('returns undefined outside a working tree instead of half-working', async () => {
		const outside = mkdtempSync(join(tmpdir(), 'delendai-not-a-repo-'));
		try {
			// A caller that cannot reach git must find out HERE, not
			// halfway through a merge.
			expect(await createIntegrationGit(outside)).toBe(undefined);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});
	it('refuses a push whose expected remote tip is not what is there', async () => {
		const dir = repository();
		const remote = mkdtempSync(join(tmpdir(), 'delendai-remote-'));
		try {
			git(
				remote,
				'init',
				'--quiet',
				'--bare',
				'--initial-branch',
				'develop',
			);
			git(dir, 'remote', 'add', 'origin', remote);
			git(dir, 'push', '--quiet', 'origin', 'develop');
			const landed = git(dir, 'rev-parse', 'HEAD');

			// Somebody else lands first.
			write(dir, 'd.txt', 'theirs\n');
			git(dir, 'add', '-A');
			git(dir, 'commit', '--quiet', '-m', 'theirs');
			git(dir, 'push', '--quiet', 'origin', 'develop');

			write(dir, 'e.txt', 'mine\n');
			git(dir, 'add', '-A');
			git(dir, 'commit', '--quiet', '-m', 'mine');
			const mine = git(dir, 'rev-parse', 'HEAD');
			const port = await createIntegrationGit(dir);

			// Built against a head that has since moved. Losing this race
			// must cost a refusal, never somebody else's commit.
			const stale = await port?.pushRef({
				remote: 'origin',
				localRef: mine,
				branch: 'develop',
				force: true,
				expectedRemoteSha: landed,
			});
			expect(stale?.ok).toBe(false);

			git(dir, 'fetch', '--quiet', 'origin');
			const actual = git(dir, 'rev-parse', 'refs/remotes/origin/develop');
			const fresh = await port?.pushRef({
				remote: 'origin',
				localRef: mine,
				branch: 'develop',
				force: true,
				expectedRemoteSha: actual,
			});
			expect(fresh?.ok).toBe(true);
		} finally {
			rmSync(remote, { recursive: true, force: true });
		}
	});

	it('refuses to delete a ref that has moved since it was inspected', async () => {
		const dir = repository();
		const stale = git(dir, 'rev-parse', 'HEAD');
		git(dir, 'update-ref', 'refs/wip/agent/slice', stale);
		write(dir, 'f.txt', 'newer\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'newer');
		git(
			dir,
			'update-ref',
			'refs/wip/agent/slice',
			git(dir, 'rev-parse', 'HEAD'),
		);

		const port = await createIntegrationGit(dir);

		// Losing an agent's checkpoint to a stale expectation is exactly
		// the failure this port exists to prevent.
		const refused = await port?.deleteRef({
			ref: 'refs/wip/agent/slice',
			expectedSha: stale,
		});
		expect(refused?.ok).toBe(false);
		expect(git(dir, 'rev-parse', 'refs/wip/agent/slice')).not.toBe(stale);

		const current = git(dir, 'rev-parse', 'refs/wip/agent/slice');
		const deleted = await port?.deleteRef({
			ref: 'refs/wip/agent/slice',
			expectedSha: current,
		});
		expect(deleted?.ok).toBe(true);
	});

	it('reports a fetch from a remote that is not there', async () => {
		const dir = repository();
		const port = await createIntegrationGit(dir);

		const result = await port?.fetch(
			'nowhere',
			'+refs/heads/*:refs/remotes/nowhere/*',
		);

		expect(result?.ok).toBe(false);
		expect(result?.reason.length).toBeGreaterThan(0);
	});
	it('fails cleanly when the repository disappears under it', async () => {
		const dir = repository();
		const integration = git(dir, 'rev-parse', 'HEAD');
		git(dir, 'checkout', '--quiet', '-b', 'work');
		write(dir, 'g.txt', 'work\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '--quiet', '-m', 'work');
		const incoming = git(dir, 'rev-parse', 'HEAD');
		git(dir, 'checkout', '--quiet', 'develop');

		const port = await createIntegrationGit(dir);
		// The port was bound while the repository was there. Everything
		// after this point is git refusing to answer, which is the
		// pathway that decides whether an agent's work ref gets deleted
		// on evidence that could not actually be gathered.
		rmSync(join(dir, '.git'), { recursive: true, force: true });

		const result = await port?.mergeCommit({
			base: integration,
			incoming,
			message: 'merge',
		});

		expect(result?.kind).toBe('failed');
		if (result?.kind !== 'failed') throw new Error('expected failure');
		expect(result.reason.length).toBeGreaterThan(0);
	});
});
