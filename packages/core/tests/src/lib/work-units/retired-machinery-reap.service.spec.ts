/**
 * retired-machinery-reap.service.spec.ts — the train branches and scratch
 * worktrees the retired queue left go once they hold nothing of their own;
 * one that may hold the only copy of a commit stays.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { reapRetiredMachinery } from '@delendai/core/lib/work-units/retired-machinery-reap.service';

import { cleanUnitRepos, git, unitPolicy, unitRepo } from './unit-repo.helper';

afterEach(cleanUnitRepos);

const reap = (root: string, apply: boolean) =>
	reapRetiredMachinery({ root, policy: unitPolicy, apply });

describe('reapRetiredMachinery', () => {
	it('[<1500ms] removes a train branch and a scratch worktree that hold nothing of their own', () => {
		const repo = unitRepo();
		const unit = repo.enter('delendai/wip/a/x1-S1-g1/work');
		repo.commit(unit, 'held.ts');
		// A train merged the unit's commit: every commit is held elsewhere.
		git(
			repo.root,
			'branch',
			'delendai/train/0123456789ab/1',
			'delendai/wip/a/x1-S1-g1/work',
		);
		const scratch = join(
			mkdtempSync(join(tmpdir(), 'unit-scratch-')),
			'delendai-train-abc',
		);
		git(repo.root, 'worktree', 'add', '-q', '--detach', scratch, 'develop');

		expect(reap(repo.root, false).map((r) => r.outcome)).toEqual([
			'would-remove',
			'would-remove',
		]);
		const done = reap(repo.root, true);
		expect(done.map((r) => r.outcome)).toEqual(['removed', 'removed']);
		expect(
			git(repo.root, 'for-each-ref', 'refs/heads/delendai/train'),
		).toBe('');
		expect(git(repo.root, 'worktree', 'list')).not.toContain(scratch);
		// The unit itself is not the retired machinery's.
		expect(git(repo.root, 'worktree', 'list')).toContain(unit);
	});

	it('[<1500ms] keeps a train branch that may hold the only copy of a commit', () => {
		const repo = unitRepo();
		const unit = repo.enter('delendai/wip/a/x1-S1-g1/work');
		repo.commit(unit, 'only-here.ts');
		git(
			repo.root,
			'branch',
			'delendai/train/culprit/7',
			'delendai/wip/a/x1-S1-g1/work',
		);
		git(repo.root, 'worktree', 'remove', '--force', unit);
		git(repo.root, 'branch', '-q', '-D', 'delendai/wip/a/x1-S1-g1/work');

		const done = reap(repo.root, true);
		expect(done).toEqual([
			{
				what: 'refs/heads/delendai/train/culprit/7',
				outcome: 'kept',
				why: 'it may hold the only copy of a commit',
			},
		]);
		expect(
			git(
				repo.root,
				'for-each-ref',
				'--format=%(refname)',
				'refs/heads/delendai/train',
			),
		).toBe('refs/heads/delendai/train/culprit/7');
	});
});
