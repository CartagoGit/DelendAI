/**
 * stray-refs-reap.service.spec.ts — a stray ref is removed only when it
 * carries no work.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	holdsOnlyEmptyCommits,
	reapStrayRefs,
} from '@delendai/core/lib/work-units/stray-refs-reap.service';

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const repo = () => {
	const root = mkdtempSync(join(tmpdir(), 'stray-reap-'));
	dirs.push(root);
	const git = (...args: string[]): string =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '-q', '-b', 'develop');
	git('config', 'user.name', 'spec');
	git('config', 'user.email', 'spec@example.invalid');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	const tree = git('rev-parse', 'HEAD^{tree}');
	const base = git('rev-parse', 'HEAD');
	// A claim: an empty commit on the integration branch.
	const claim = git('commit-tree', tree, '-p', base, '-m', 'review claim x1');
	git('update-ref', 'refs/delendai-remote-claims/x1', claim);
	// What a claim really is: a commit with no parent, over the tree the
	// integration branch had when it was made.
	const rootClaim = git('commit-tree', tree, '-m', 'review claim x2');
	git('update-ref', 'refs/delendai-remote-claims/x2', rootClaim);
	// A root commit over a tree nobody had is somebody's: kept.
	writeFileSync(join(root, 'c.txt'), 'c\n');
	git('add', 'c.txt');
	const foreign = git('commit-tree', git('write-tree'), '-m', 'unknown');
	git('update-ref', 'refs/delendai-remote-claims/foreign', foreign);
	git('rm', '-q', '--cached', 'c.txt');
	// Work: a commit that changes a file, under the same stray namespace.
	writeFileSync(join(root, 'b.txt'), 'b\n');
	git('add', 'b.txt');
	const workTree = git('write-tree');
	const work = git('commit-tree', workTree, '-p', base, '-m', 'somebody');
	git('update-ref', 'refs/delendai-remote-claims/work', work);
	git('reset', '-q', '--hard', 'HEAD');
	return { root, git, base };
};

describe('reapStrayRefs', () => {
	it('removes a stray ref of empty commits and keeps one that carries work', () => {
		const { root, git } = repo();
		expect(reapStrayRefs({ root, policy, apply: false })).toEqual([
			{ ref: 'refs/delendai-remote-claims/foreign', outcome: 'kept' },
			{ ref: 'refs/delendai-remote-claims/work', outcome: 'kept' },
			{
				ref: 'refs/delendai-remote-claims/x1',
				outcome: 'would-remove',
				reason: 'no-work',
			},
			{
				ref: 'refs/delendai-remote-claims/x2',
				outcome: 'would-remove',
				reason: 'no-work',
			},
		]);
		expect(reapStrayRefs({ root, policy, apply: true })).toEqual([
			{ ref: 'refs/delendai-remote-claims/foreign', outcome: 'kept' },
			{ ref: 'refs/delendai-remote-claims/work', outcome: 'kept' },
			{
				ref: 'refs/delendai-remote-claims/x1',
				outcome: 'removed',
				reason: 'no-work',
			},
			{
				ref: 'refs/delendai-remote-claims/x2',
				outcome: 'removed',
				reason: 'no-work',
			},
		]);
		expect(
			git(
				'for-each-ref',
				'--format=%(refname)',
				'refs/delendai-remote-claims',
			),
		).toBe(
			[
				'refs/delendai-remote-claims/foreign',
				'refs/delendai-remote-claims/work',
			].join('\n'),
		);
	});

	it('removes a claim taken on a branch the integration branch merged', () => {
		const { root, git } = repo();
		// The reviewer's branch claims on its own commit, and reaches the
		// integration branch through a merge: its tree is never one of the
		// first-parent line's.
		git('switch', '-q', '-c', 'review');
		writeFileSync(join(root, 'r.txt'), 'r\n');
		git('add', 'r.txt');
		git('commit', '-q', '-m', 'chore(review): claim x3');
		const reviewTree = git('rev-parse', 'HEAD^{tree}');
		git('switch', '-q', 'develop');
		writeFileSync(join(root, 'd.txt'), 'd\n');
		git('add', 'd.txt');
		git('commit', '-q', '-m', 'meanwhile');
		git('merge', '-q', '--no-ff', '--no-edit', 'review');
		const claim = git('commit-tree', reviewTree, '-m', 'review claim x3');
		git('update-ref', 'refs/delendai-remote-claims/x3', claim);
		expect(
			reapStrayRefs({ root, policy, apply: true }).find(
				(each) => each.ref === 'refs/delendai-remote-claims/x3',
			),
		).toEqual({
			ref: 'refs/delendai-remote-claims/x3',
			outcome: 'removed',
			reason: 'no-work',
		});
	});

	it('removes a copy of what the forge holds, and keeps a tip only here', () => {
		const { root, git } = repo();
		const forge = mkdtempSync(join(tmpdir(), 'stray-forge-'));
		dirs.push(forge);
		execFileSync('git', ['init', '-q', '--bare', forge]);
		git('remote', 'add', 'origin', forge);
		// The forge keeps `work` as a retired tip, and `foreign` inside a
		// branch the clone tracks.
		git(
			'push',
			'-q',
			'origin',
			'refs/delendai-remote-claims/work:refs/delendai/retired/bot/x1',
		);
		const wrapper = git(
			'commit-tree',
			git('rev-parse', 'refs/delendai-remote-claims/foreign^{tree}'),
			'-p',
			'refs/delendai-remote-claims/foreign',
			'-m',
			'kept elsewhere',
		);
		git('push', '-q', 'origin', `${wrapper}:refs/heads/held`);
		git('fetch', '-q', 'origin');
		writeFileSync(join(root, 'l.txt'), 'l\n');
		git('add', 'l.txt');
		const lonely = git('commit-tree', git('write-tree'), '-m', 'only here');
		git('update-ref', 'refs/delendai-remote-claims/lonely', lonely);
		git('reset', '-q', '--hard', 'HEAD');
		const reaped = reapStrayRefs({
			root,
			policy,
			apply: true,
			remote: 'origin',
		});
		const outcomeOf = (name: string) =>
			reaped.find(
				(each) => each.ref === `refs/delendai-remote-claims/${name}`,
			);
		expect(outcomeOf('work')).toEqual({
			ref: 'refs/delendai-remote-claims/work',
			outcome: 'removed',
			reason: 'on-the-forge',
		});
		expect(outcomeOf('foreign')).toMatchObject({
			outcome: 'removed',
			reason: 'on-the-forge',
		});
		expect(outcomeOf('lonely')).toEqual({
			ref: 'refs/delendai-remote-claims/lonely',
			outcome: 'kept',
		});
	});

	it('never touches branches, tags or the product namespace', () => {
		const { root, git } = repo();
		git('update-ref', 'refs/delendai/journal', 'HEAD');
		git('tag', 'v1');
		const refs = reapStrayRefs({ root, policy, apply: false }).map(
			(each) => each.ref,
		);
		expect(
			refs.filter(
				(ref) => !ref.startsWith('refs/delendai-remote-claims/'),
			),
		).toEqual([]);
	});
});

describe('holdsOnlyEmptyCommits', () => {
	it('is true for nothing beyond the base, and false for a merge', () => {
		const { root, git, base } = repo();
		expect(holdsOnlyEmptyCommits(root, base, base)).toBe(true);
		const tree = git('rev-parse', `${base}^{tree}`);
		const other = git('commit-tree', tree, '-p', base, '-m', 'other');
		const merge = git(
			'commit-tree',
			tree,
			'-p',
			base,
			'-p',
			other,
			'-m',
			'merge',
		);
		expect(holdsOnlyEmptyCommits(root, merge, base)).toBe(false);
	});
});
