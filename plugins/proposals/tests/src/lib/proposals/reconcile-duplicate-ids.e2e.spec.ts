import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	copyToKeep,
	reconcileDuplicateProposalIds,
} from '@delendai/proposals/lib/proposals/reconcile-duplicate-ids';
import { createGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const PROPOSALS = 'docs/delendai/proposals';
const FILE = 'f00155-perfs-example.md';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		[
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t.invalid',
			'-c',
			'core.hooksPath=/dev/null',
			...args,
		],
		{ cwd, encoding: 'utf8' },
	);

const proposal = (status: string, stamp?: string): string =>
	`---\nid: f00155\ntitle: "Example"\nkind: feat\nstatus: ${status}\n${
		stamp === undefined ? '' : `last-transition-at: ${stamp}\n`
	}---\n\n# f00155\n`;

const put = (root: string, folder: string, text: string): void => {
	mkdirSync(join(root, PROPOSALS, folder), { recursive: true });
	writeFileSync(join(root, PROPOSALS, folder, FILE), text);
};

const filesIn = (root: string): string[] =>
	['ready', 'ready/feats', 'review', 'done']
		.flatMap((folder) => {
			try {
				return readdirSync(join(root, PROPOSALS, folder)).map(
					(name) => `${folder}/${name}`,
				);
			} catch {
				return [];
			}
		})
		.filter((name) => name.endsWith(FILE));

describe('x01054 S1: a merge never leaves a proposal twice', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'dup-ids-'));
		git(root, 'init', '-q', '-b', 'develop');
		writeFileSync(join(root, 'README.md'), 'x\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	// ROOT CAUSE: two branches that move one proposal leave it at two
	// paths; git merges them without a conflict and develop holds the id
	// twice, which the registry refuses.
	const mergeTwoBranches = (
		create: { folder: string; text: string },
		slices: { folder: string; text: string },
	): void => {
		git(root, 'checkout', '-q', '-b', 'create');
		put(root, create.folder, create.text);
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'create');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'checkout', '-q', '-b', 'slices');
		put(root, slices.folder, slices.text);
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'slices');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'merge', '-q', '--no-ff', '-m', 'train', 'create');
		git(root, 'merge', '-q', '--no-ff', '-m', 'train', 'slices');
	};

	it('[<400ms] keeps the review copy over the ready one the create branch carried', async () => {
		mergeTwoBranches(
			{ folder: 'ready', text: proposal('ready') },
			{
				folder: 'review',
				text: proposal('review', '2026-11-08T10:00:00.000Z'),
			},
		);
		expect(filesIn(root)).toHaveLength(2);
		const result = await reconcileDuplicateProposalIds(
			join(root, PROPOSALS),
			createGitRunner(root),
		);
		expect(result.removed.map((entry) => entry.from)).toEqual([
			`ready/${FILE}`,
		]);
		expect(filesIn(root)).toEqual([`review/${FILE}`]);
	});

	it('[<400ms] keeps the later transition when the earlier branch is further along', async () => {
		mergeTwoBranches(
			{
				folder: 'review',
				text: proposal('review', '2026-11-08T09:00:00.000Z'),
			},
			{
				folder: 'ready',
				text: proposal('ready', '2026-11-08T11:00:00.000Z'),
			},
		);
		await reconcileDuplicateProposalIds(
			join(root, PROPOSALS),
			createGitRunner(root),
		);
		// The folder reconciler put the survivor where its status and kind belong.
		expect(filesIn(root)).toEqual([`ready/feats/${FILE}`]);
	});

	it('[<100ms] breaks a tie on the stamp by the status order, then by path', () => {
		const same = '2026-11-08T10:00:00.000Z';
		expect(
			copyToKeep([
				{ path: 'ready/a.md', status: 'ready', lastTransitionAt: same },
				{ path: 'done/a.md', status: 'done', lastTransitionAt: same },
				{
					path: 'review/a.md',
					status: 'review',
					lastTransitionAt: same,
				},
			]).path,
		).toBe('done/a.md');
		expect(
			copyToKeep([
				{ path: 'b/a.md', status: 'ready', lastTransitionAt: '' },
				{ path: 'a/a.md', status: 'ready', lastTransitionAt: '' },
			]).path,
		).toBe('a/a.md');
	});
});
