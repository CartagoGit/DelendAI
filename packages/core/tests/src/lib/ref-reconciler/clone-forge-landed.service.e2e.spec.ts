/**
 * clone-forge-landed.service.e2e.spec.ts — a unit whose every commit is on
 * the integration branch ends once its owner is idle, whoever owns it,
 * even while its proposal is still in progress for other slices.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
import { endDeliveredUnits } from '@delendai/core/lib/ref-reconciler/clone-forge-ports.service';
import { readUnitStandings } from '@delendai/core/lib/work-units/unit-standings.service';

import {
	cleanUnitRepos,
	git,
	unitPolicy,
	unitRef,
	unitRepo,
} from '../work-units/unit-repo.helper';

afterEach(cleanUnitRepos);

const MINUTE = 60;
const wall = (): number => Math.floor(Date.now() / 1000);

/** A unit whose proposal is still in progress for other slices: landed, quiet, standing idle. */
const landedInProgressUnit = async (agent: string) => {
	const repo = unitRepo();
	const start = wall();
	const ref = unitRef(agent);
	const worktree = repo.enter(ref);
	await recordUnitEntered({
		cwd: repo.root,
		ref,
		owner: { agent, session: 's' },
		worktree,
		now: start - 600 * MINUTE,
	});
	mkdirSync(join(worktree, 'docs/delendai/proposals/in-progress'), {
		recursive: true,
	});
	repo.commit(worktree, 'docs/delendai/proposals/in-progress/x1-demo.md');
	git(repo.root, 'merge', '-q', '--no-ff', '-m', 'merge unit', ref);
	return { repo, ref, worktree, start };
};

describe('endDeliveredUnits, a landed unit of an in-progress proposal', () => {
	it('[<2000ms] [<1500ms] is idle, not delivered, while its proposal is in progress', async () => {
		const { repo, ref, start } = await landedInProgressUnit('another');
		const standings = await readUnitStandings({
			root: repo.root,
			policy: unitPolicy,
			now: start,
		});
		expect(standings.find((e) => e.ref === ref)?.standing).toBe('idle');
	});

	it('[<2000ms] [<1500ms] is ended whatever agent owns it once the owner is idle', async () => {
		const { repo, ref, worktree, start } =
			await landedInProgressUnit('another');
		const [reaped] = await endDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('removed');
		expect(existsSync(worktree)).toBe(false);
		expect(git(repo.root, 'branch', '--list', ref)).toBe('');
	});

	it('[<2000ms] [<1500ms] is only listed without --apply', async () => {
		const { repo, worktree, start } = await landedInProgressUnit('another');
		const [reaped] = await endDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: false,
			now: start,
		});
		expect(reaped?.outcome).toBe('would-remove');
		expect(existsSync(worktree)).toBe(true);
	});

	it('[<2000ms] [<1500ms] is kept when one commit is not on the integration branch', async () => {
		const { repo, ref, worktree, start } =
			await landedInProgressUnit('another');
		repo.commit(worktree, 'unmerged.ts');
		const reaped = await endDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped).toEqual([]);
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
	});

	it('[<2000ms] [<1500ms] is kept, edits named, when its worktree holds an uncommitted edit', async () => {
		const { repo, worktree, start } = await landedInProgressUnit('another');
		writeFileSync(join(worktree, 'draft.ts'), 'export {};\n');
		const [reaped] = await endDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('kept');
		expect(reaped?.edited).toContain('draft.ts');
	});
});
