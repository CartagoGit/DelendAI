/**
 * unit-removal.service.spec.ts — a unit's branch is removed only at the
 * tip it was judged spent at, before its worktree, and never while
 * anybody is on the unit.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	computeSlotPath,
	withComputeSlot,
} from '@delendai/core/lib/shared/compute-slot.service';
import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
import { removeUnitCheckout } from '@delendai/core/lib/work-units/unit-removal.service';

import {
	cleanUnitRepos,
	git,
	unitPolicy,
	unitRef,
	unitRepo,
} from './unit-repo.helper';

const gitCalls = vi.hoisted(() => [] as (readonly string[])[]);
vi.mock(
	'@delendai/core/lib/work-units/work-unit-shared.service',
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import('@delendai/core/lib/work-units/work-unit-shared.service')
			>();
		return {
			...actual,
			readGit: (cwd: string, args: readonly string[]) => {
				gitCalls.push(args);
				return actual.readGit(cwd, args);
			},
		};
	},
);

afterEach(() => {
	gitCalls.splice(0);
	cleanUnitRepos();
});

const MINUTE = 60;
const wall = (): number => Math.floor(Date.now() / 1000);

/** A unit with one commit of its own, quiet for an hour and a half. */
const quietUnit = async () => {
	const repo = unitRepo();
	const ref = unitRef('agent-a');
	const worktree = repo.enter(ref);
	repo.commit(worktree, 'feature.ts');
	await recordUnitEntered({
		cwd: repo.root,
		ref,
		owner: { agent: 'agent-a', session: 's' },
		worktree,
		now: wall() - 90 * MINUTE,
	});
	return { repo, ref, worktree, tip: git(repo.root, 'rev-parse', ref) };
};

const branchOf = (root: string, ref: string): string =>
	git(root, 'branch', '--list', ref);

describe('removeUnitCheckout', () => {
	it('deletes the branch before it removes the worktree', async () => {
		const { repo, ref, worktree, tip } = await quietUnit();
		const removal = await removeUnitCheckout(repo.root, ref, {
			policy: unitPolicy,
			tip,
		});
		expect(removal).toMatchObject({ keptBecauseEdited: [] });
		expect(removal.keptBecauseAlive).toBeUndefined();
		expect(removal.deletedBranch).toBe(true);
		expect(existsSync(worktree)).toBe(false);
		const step = (verb: string): number =>
			gitCalls.findIndex((args) => args.slice(0, 2).join(' ') === verb);
		expect(step('update-ref -d')).toBeGreaterThanOrEqual(0);
		expect(step('worktree remove')).toBeGreaterThan(step('update-ref -d'));
	});

	it('aborts when the ref moved between judgement and removal, worktree in place', async () => {
		const { repo, ref, worktree, tip } = await quietUnit();
		repo.commit(worktree, 'after-the-judgement.ts');
		const moved = git(repo.root, 'rev-parse', ref);

		const removal = await removeUnitCheckout(repo.root, ref, {
			policy: unitPolicy,
			tip,
		});
		expect(removal).toMatchObject({
			deletedBranch: false,
			keptBecauseMoved: true,
		});
		expect(existsSync(worktree)).toBe(true);
		expect(git(repo.root, 'rev-parse', ref)).toBe(moved);
		expect(
			gitCalls.some(
				(args) => args.slice(0, 2).join(' ') === 'worktree remove',
			),
		).toBe(false);
	});

	it('never removes a unit whose lease beat inside the window', async () => {
		const { repo, ref, worktree, tip } = await quietUnit();
		await recordUnitEntered({
			cwd: repo.root,
			ref,
			owner: { agent: 'agent-a', session: 's' },
			worktree,
			now: wall() - MINUTE,
		});
		const removal = await removeUnitCheckout(repo.root, ref, {
			policy: unitPolicy,
			tip,
		});
		expect(removal.deletedBranch).toBe(false);
		expect(removal.keptBecauseAlive).toContain('lease beat');
		expect(existsSync(worktree)).toBe(true);
		expect(branchOf(repo.root, ref)).toContain(ref);
	});

	it('never removes a unit whose proof is in flight', async () => {
		const { repo, ref, worktree, tip } = await quietUnit();
		const lockPath = computeSlotPath(repo.root);
		expect(lockPath).toBeDefined();
		const removal = await withComputeSlot({
			lockPath: lockPath as string,
			label: 'proof in flight',
			unit: worktree,
			tip,
			notify: () => undefined,
			run: () =>
				removeUnitCheckout(repo.root, ref, { policy: unitPolicy, tip }),
		});
		expect(removal.deletedBranch).toBe(false);
		expect(removal.keptBecauseAlive).toContain('proof');
		expect(existsSync(worktree)).toBe(true);
	});

	it.runIf(existsSync('/proc/self/cwd'))(
		'never removes a worktree a live process works inside',
		async () => {
			const { repo, ref, worktree, tip } = await quietUnit();
			const child = spawn('sleep', ['30'], {
				cwd: worktree,
				stdio: 'ignore',
			});
			try {
				const removal = await removeUnitCheckout(repo.root, ref, {
					policy: unitPolicy,
					tip,
				});
				expect(removal.keptBecauseAlive).toContain('process');
				expect(existsSync(worktree)).toBe(true);
				expect(branchOf(repo.root, ref)).toContain(ref);
			} finally {
				child.kill();
			}
		},
	);

	it('puts the branch back at the judged tip when the worktree cannot go', async () => {
		const { repo, ref, worktree, tip } = await quietUnit();
		git(repo.root, 'worktree', 'lock', worktree);
		const removal = await removeUnitCheckout(repo.root, ref, {
			policy: unitPolicy,
			tip,
		});
		expect(removal.deletedBranch).toBe(false);
		expect(existsSync(worktree)).toBe(true);
		expect(git(repo.root, 'rev-parse', ref)).toBe(tip);
		expect(git(worktree, 'symbolic-ref', 'HEAD')).toBe(`refs/heads/${ref}`);
		expect(git(worktree, 'status', '--porcelain')).toBe('');
	});
});
