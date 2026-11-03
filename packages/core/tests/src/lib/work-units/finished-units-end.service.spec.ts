/**
 * finished-units-end.service.spec.ts — a unit the integration branch
 * holds ends whole, here and on the forge, with its tip kept; work the
 * integration branch lacks, a dirty worktree and a person's branch stay.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { endFinishedUnits } from '@delendai/core/lib/work-units/finished-units-end.service';
import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';

import { cleanUnitRepos, git, unitPolicy, unitRepo } from './unit-repo.helper';

afterEach(cleanUnitRepos);

const MINUTE = 60;
const wall = (): number => Math.floor(Date.now() / 1000);

const reviewRef = (agent: string) =>
	`delendai/wip/${agent}/review/i00002-all-g1/verdicts`;

/** A repository with a bare `origin`, develop pushed to it. */
const withForge = () => {
	const repo = unitRepo();
	const forge = join(dirname(repo.root), 'forge.git');
	execFileSync('git', ['init', '-q', '--bare', forge]);
	git(repo.root, 'remote', 'add', 'origin', forge);
	git(repo.root, 'push', '-q', 'origin', 'develop');
	git(repo.root, 'branch', '-q', '--set-upstream-to=origin/develop');
	return { repo, forge };
};

/** A unit that committed a file and was pushed, owner quiet for 90 min. */
const quietUnit = async (
	repo: ReturnType<typeof unitRepo>,
	ref: string,
	file: string,
) => {
	const worktree = repo.enter(ref);
	await recordUnitEntered({
		cwd: repo.root,
		ref,
		owner: { agent: 'reviewer', session: 's' },
		worktree,
		now: wall() - 90 * MINUTE,
	});
	repo.commit(worktree, file);
	git(repo.root, 'push', '-q', 'origin', ref);
	return worktree;
};

const landOnForge = (root: string, ref: string): void => {
	git(root, 'merge', '-q', '--no-ff', '-m', `Merge ${ref}`, ref);
	git(root, 'push', '-q', 'origin', 'develop');
};

describe('endFinishedUnits', () => {
	it('ends a finished review unit: worktree, branch and forge copy go, the tip is kept', async () => {
		const { repo, forge } = withForge();
		const ref = reviewRef('auditor');
		const worktree = await quietUnit(repo, ref, 'verdict.md');
		const tip = git(repo.root, 'rev-parse', ref);
		landOnForge(repo.root, ref);
		// A person's branch the integration branch also holds: never seen.
		git(repo.root, 'branch', 'fix/typo', ref);

		const [ended] = await endFinishedUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
		});

		expect(ended?.outcome).toBe('ended');
		expect(existsSync(worktree)).toBe(false);
		expect(git(repo.root, 'branch', '--list', ref)).toBe('');
		expect(git(forge, 'branch', '--list', ref)).toBe('');
		expect(
			git(
				repo.root,
				'rev-parse',
				'refs/delendai/retired/auditor/review/i00002-all-g1/verdicts',
			),
		).toBe(tip);
		expect(git(repo.root, 'branch', '--list', 'fix/typo')).toContain(
			'fix/typo',
		);
	});

	it('reports without deleting when not applied', async () => {
		const { repo } = withForge();
		const ref = reviewRef('verifier');
		await quietUnit(repo, ref, 'verdict.md');
		landOnForge(repo.root, ref);
		const [judged] = await endFinishedUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: false,
		});
		expect(judged?.outcome).toBe('would-end');
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
	});

	it('keeps a unit holding work the integration branch lacks', async () => {
		const { repo, forge } = withForge();
		const ref = reviewRef('reviewer');
		const worktree = await quietUnit(repo, ref, 'verdict.md');
		landOnForge(repo.root, ref);
		repo.commit(worktree, 'second-verdict.md');
		git(repo.root, 'push', '-q', 'origin', ref);

		const [kept] = await endFinishedUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
		});

		expect(kept).toMatchObject({ outcome: 'kept', reason: 'holds-work' });
		expect(existsSync(worktree)).toBe(true);
		expect(git(forge, 'branch', '--list', ref)).toContain(ref);
		expect(git(repo.root, 'for-each-ref', 'refs/delendai/retired')).toBe(
			'',
		);
	});

	it('keeps a landed unit whose worktree holds an edit of its own', async () => {
		const { repo, forge } = withForge();
		const ref = reviewRef('dirty');
		const worktree = await quietUnit(repo, ref, 'verdict.md');
		landOnForge(repo.root, ref);
		writeFileSync(join(worktree, 'verdict.md'), 'not committed\n');

		const [kept] = await endFinishedUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
		});

		expect(kept).toMatchObject({
			outcome: 'kept',
			reason: 'edited',
			edited: ['verdict.md'],
		});
		expect(existsSync(worktree)).toBe(true);
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
		expect(git(forge, 'branch', '--list', ref)).toContain(ref);
	});

	it('ends a rewritten unit whose publication a merge names and whose content landed', async () => {
		const { repo, forge } = withForge();
		const ref = reviewRef('amended');
		const worktree = await quietUnit(repo, ref, 'verdict.md');
		const publication = ref.replace('delendai/wip/', 'delendai/pr/');
		// The publication was rebuilt from the same content, then merged.
		git(repo.root, 'checkout', '-q', '-b', publication, 'develop');
		writeFileSync(
			join(repo.root, 'verdict.md'),
			"export const f = 'verdict.md';\n",
		);
		git(repo.root, 'add', '-A');
		git(repo.root, 'commit', '-q', '-m', 'rebuilt');
		git(repo.root, 'checkout', '-q', 'develop');
		git(
			repo.root,
			'merge',
			'-q',
			'--no-ff',
			'-m',
			`Merge pull request #7 from owner/${publication}`,
			publication,
		);
		git(repo.root, 'push', '-q', 'origin', 'develop', publication);

		const [ended] = await endFinishedUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
		});

		expect(ended?.outcome).toBe('ended');
		expect(ended?.retiredRefs.length).toBe(2);
		expect(existsSync(worktree)).toBe(false);
		expect(git(forge, 'branch', '--list', 'delendai/*')).toBe('');
	});

	it('leaves a unit that never moved while its owner may still start', async () => {
		const { repo } = withForge();
		const ref = reviewRef('entered');
		const worktree = repo.enter(ref);
		await recordUnitEntered({
			cwd: repo.root,
			ref,
			owner: { agent: 'entered', session: 's' },
			worktree,
			now: wall() - 45 * MINUTE,
		});
		const [kept] = await endFinishedUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
		});
		expect(kept).toMatchObject({ outcome: 'kept', reason: 'unstarted' });
		expect(existsSync(worktree)).toBe(true);
	});
});
