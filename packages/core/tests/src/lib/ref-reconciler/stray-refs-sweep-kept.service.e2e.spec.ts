/**
 * stray-refs-sweep-kept.service.e2e.spec.ts — a stranded or rescued ref goes
 * when its patches are on the integration branch, and is listed otherwise.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { reapStrayRefs } from '@delendai/core/lib/ref-reconciler/stray-refs-sweep.service';

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

describe('reapStrayRefs over stranded and rescued refs', () => {
	/** develop with a base commit; `side` branches off it for work to land twice. */
	const landed = () => {
		const { root, git, base } = repo();
		// develop moves on, so a cherry-pick is a commit of another hash.
		writeFileSync(join(root, 'drift.txt'), 'drift\n');
		git('add', 'drift.txt');
		git('commit', '-q', '-m', 'drift');
		const commitOn = (branch: string, file: string): string => {
			git('switch', '-q', '-c', branch, base);
			writeFileSync(join(root, file), `${file}\n`);
			git('add', file);
			git('commit', '-q', '-m', `add ${file}`);
			const tip = git('rev-parse', 'HEAD');
			git('switch', '-q', 'develop');
			return tip;
		};
		return { root, git, base, commitOn };
	};

	it('[<2000ms] removes a ref whose patch landed under another hash', () => {
		const { root, git, commitOn } = landed();
		const tip = commitOn('stranded-src', 'one.txt');
		git('update-ref', 'refs/delendai/stranded/bot/a1', tip);
		// The same patch on develop, committed again: another hash.
		git('cherry-pick', tip);
		const [result] = reapStrayRefs({ root, policy, apply: true }).filter(
			(each) => each.ref.startsWith('refs/delendai/stranded/'),
		);
		expect(result).toEqual({
			ref: 'refs/delendai/stranded/bot/a1',
			outcome: 'removed',
			reason: 'patch-landed',
		});
		expect(
			git(
				'for-each-ref',
				'--format=%(refname)',
				'refs/delendai/stranded',
			),
		).toBe('');
	});

	it('[<2000ms] lists a rescued ref with a unique patch, with its age and files, and keeps it', () => {
		const { root, git, commitOn } = landed();
		const tip = commitOn('rescued-src', 'unique.txt');
		git('update-ref', 'refs/delendai/rescued/bot/b2', tip);
		const now = Math.floor(Date.now() / 1000) + 3600;
		const [result] = reapStrayRefs({
			root,
			policy,
			apply: true,
			now,
		}).filter((each) => each.ref.startsWith('refs/delendai/rescued/'));
		expect(result).toMatchObject({
			ref: 'refs/delendai/rescued/bot/b2',
			outcome: 'kept',
			files: ['unique.txt'],
		});
		expect(result?.ageSeconds).toBeGreaterThanOrEqual(3500);
		expect(git('rev-parse', 'refs/delendai/rescued/bot/b2')).toBe(tip);
	});

	it('[<2000ms] removes an empty ref and only lists, without --apply, one that landed', () => {
		const { root, git, base, commitOn } = landed();
		git('update-ref', 'refs/delendai/stranded/bot/empty', base);
		const tip = commitOn('landed-src', 'two.txt');
		git('update-ref', 'refs/delendai/stranded/bot/c3', tip);
		git('cherry-pick', tip);
		const planned = reapStrayRefs({ root, policy, apply: false }).filter(
			(each) => each.ref.startsWith('refs/delendai/stranded/'),
		);
		expect(planned.map((each) => each.outcome)).toEqual([
			'would-remove',
			'would-remove',
		]);
		const done = reapStrayRefs({ root, policy, apply: true }).filter(
			(each) => each.ref.startsWith('refs/delendai/stranded/'),
		);
		expect(done.map((each) => each.reason)).toEqual([
			'patch-landed',
			'no-work',
		]);
	});
});
