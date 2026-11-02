/**
 * unit-edits-kept.service.spec.ts — an abandoned unit's uncommitted edits
 * are kept on the forge and the unit removed; nothing is left standing.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
import { reapDeliveredUnits } from '@delendai/core/lib/work-units/unit-reaper.service';

import {
	cleanUnitRepos,
	git,
	unitPolicy,
	unitRef,
	unitRepo,
} from './unit-repo.helper';

afterEach(cleanUnitRepos);

const MINUTE = 60;
const wall = (): number => Math.floor(Date.now() / 1000);

/** Entered, edited, never committed to, quiet for `silentMinutes`. */
const draftedUnit = async (agent: string, silentMinutes: number) => {
	const repo = unitRepo();
	const start = wall();
	const ref = unitRef(agent);
	const worktree = repo.enter(ref);
	await recordUnitEntered({
		cwd: repo.root,
		ref,
		owner: { agent, session: 's' },
		worktree,
		now: start - silentMinutes * MINUTE,
	});
	writeFileSync(join(worktree, 'draft.ts'), 'export const draft = 1;\n');
	writeFileSync(join(worktree, 'base.ts'), 'export const base = 1;\n');
	const remote = join(repo.root, '..', `${agent}-remote.git`);
	git(repo.root, 'init', '-q', '--bare', remote);
	git(repo.root, 'remote', 'add', 'origin', remote);
	return { repo, ref, worktree, start, remote };
};

const reap = (unit: Awaited<ReturnType<typeof draftedUnit>>, apply: boolean) =>
	reapDeliveredUnits({
		root: unit.repo.root,
		policy: unitPolicy,
		apply,
		now: unit.start,
	});

describe('an abandoned unit holding edits nobody committed', () => {
	it('is removed, its edits kept on the forge as a retired ref', async () => {
		const unit = await draftedUnit('drafted', 600);
		const [reaped] = await reap(unit, true);
		expect(reaped?.outcome).toBe('retired');
		expect(reaped?.keptAt).toMatch(/^refs\/[^/]+\/retired\//u);
		expect(existsSync(unit.worktree)).toBe(false);
		expect(git(unit.repo.root, 'branch', '--list', unit.ref)).toBe('');
		const keptAt = reaped?.keptAt ?? '';
		// Both the file git tracked and the one it did not are in it.
		expect(git(unit.remote, 'show', `${keptAt}:draft.ts`)).toContain(
			'draft = 1',
		);
		expect(git(unit.remote, 'show', `${keptAt}:base.ts`)).toContain(
			'base = 1',
		);
	});

	it('is only reported without --apply', async () => {
		const unit = await draftedUnit('dry', 600);
		const [reaped] = await reap(unit, false);
		expect(reaped?.outcome).toBe('would-retire');
		expect(reaped?.edited).toContain('draft.ts');
		expect(existsSync(unit.worktree)).toBe(true);
		expect(git(unit.remote, 'for-each-ref')).toBe('');
	});

	it('stays where it is when the edits could not be kept', async () => {
		const unit = await draftedUnit('offline', 600);
		git(unit.repo.root, 'remote', 'set-url', 'origin', '/nowhere.git');
		const [reaped] = await reap(unit, true);
		expect(reaped?.outcome).toBe('kept');
		expect(existsSync(unit.worktree)).toBe(true);
		expect(git(unit.repo.root, 'branch', '--list', unit.ref)).toContain(
			unit.ref,
		);
	});
});
