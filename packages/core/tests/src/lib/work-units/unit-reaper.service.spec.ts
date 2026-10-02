/**
 * unit-reaper.service.spec.ts — a delivered unit's worktree and local
 * branch are removed; real edits are reported, never deleted.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
import { reapDeliveredUnits } from '@delendai/core/lib/work-units/unit-reaper.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';
import { readUnitStandings } from '@delendai/core/lib/work-units/unit-standings.service';

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

/** A unit that committed, was merged into develop, and went quiet. */
const deliveredUnit = async (agent: string) => {
	const repo = unitRepo();
	const start = wall();
	const ref = unitRef(agent);
	const worktree = repo.enter(ref);
	await recordUnitEntered({
		cwd: repo.root,
		ref,
		owner: { agent, session: 's' },
		worktree,
		now: start - 90 * MINUTE,
	});
	repo.commit(worktree, 'feature.ts');
	git(repo.root, 'merge', '-q', '--no-ff', '-m', 'merge unit', ref);
	return { repo, ref, worktree, start };
};

describe('reapDeliveredUnits', () => {
	it('judges a merged, quiet unit delivered, and a fresh empty one not', async () => {
		const { repo, ref, start } = await deliveredUnit('done');
		const fresh = unitRef('fresh');
		await recordUnitEntered({
			cwd: repo.root,
			ref: fresh,
			owner: { agent: 'fresh', session: 's2' },
			worktree: repo.enter(fresh),
			now: start - 90 * MINUTE,
		});
		const standings = await readUnitStandings({
			root: repo.root,
			policy: unitPolicy,
			now: start,
		});
		expect(
			Object.fromEntries(standings.map((e) => [e.ref, e.standing])),
		).toEqual({ [ref]: 'delivered', [fresh]: 'idle' });
	});

	it('removes the worktree and branch of a clean delivered unit', async () => {
		const { repo, ref, worktree, start } = await deliveredUnit('clean');
		const [reaped] = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('removed');
		expect(existsSync(worktree)).toBe(false);
		expect(git(repo.root, 'branch', '--list', ref)).toBe('');
	});

	it('removes a unit that only regenerable files keep dirty', async () => {
		const { repo, worktree, start } = await deliveredUnit('regen');
		mkdirSync(join(worktree, 'docs'), { recursive: true });
		writeFileSync(join(worktree, 'docs/catalog.generated.json'), '{}');
		mkdirSync(join(worktree, 'node_modules/x'), { recursive: true });
		writeFileSync(join(worktree, 'node_modules/x/index.js'), '');
		const [reaped] = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('removed');
		expect(reaped?.regenerable.length).toBeGreaterThan(0);
		expect(existsSync(worktree)).toBe(false);
	});

	it('keeps a unit holding a real edit and says which', async () => {
		const { repo, ref, worktree, start } = await deliveredUnit('edited');
		writeFileSync(
			join(worktree, 'feature.ts'),
			'export const typed = 1;\n',
		);
		const [reaped] = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('kept');
		expect(reaped?.edited).toEqual(['feature.ts']);
		expect(existsSync(worktree)).toBe(true);
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
	});

	it('only reports without --apply', async () => {
		const { repo, worktree, start } = await deliveredUnit('dry');
		const [reaped] = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: false,
			now: start,
		});
		expect(reaped?.outcome).toBe('would-remove');
		expect(existsSync(worktree)).toBe(true);
	});
});

describe('a unit kept for continuation', () => {
	/** Published (its publication ref is at its tip), proposal in progress. */
	const publishedUnit = async (agent: string, silentMinutes: number) => {
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
		repo.commit(worktree, 'slice.ts');
		const publication = ref.replace('/wip/', '/pr/');
		git(repo.root, 'update-ref', `refs/heads/${publication}`, ref);
		return { repo, ref, worktree, start, publication };
	};

	const standingOf = async (
		input: Awaited<ReturnType<typeof publishedUnit>>,
	) =>
		(
			await readUnitStandings({
				root: input.repo.root,
				policy: unitPolicy,
				now: input.start,
			})
		).find((entry) => entry.ref === input.ref)?.standing;

	it('is waited for while its owner may continue, and not reaped', async () => {
		const unit = await publishedUnit('keeper', 40);
		expect(await standingOf(unit)).toBe('idle');
		const reaped = await reapDeliveredUnits({
			root: unit.repo.root,
			policy: unitPolicy,
			apply: true,
			now: unit.start,
		});
		expect(reaped).toHaveLength(0);
		expect(existsSync(unit.worktree)).toBe(true);
	});

	it('is reaped after hours without a sign of life, leaving its publication alone', async () => {
		const unit = await publishedUnit('forgotten', 600);
		expect(await standingOf(unit)).toBe('delivered');
		const [reaped] = await reapDeliveredUnits({
			root: unit.repo.root,
			policy: unitPolicy,
			apply: true,
			now: unit.start,
		});
		expect(reaped?.outcome).toBe('removed');
		expect(existsSync(unit.worktree)).toBe(false);
		expect(git(unit.repo.root, 'branch', '--list', unit.ref)).toBe('');
		expect(
			git(unit.repo.root, 'branch', '--list', unit.publication),
		).toContain(unit.publication);
	});

	it('is reaped at once when another agent holds the proposal', async () => {
		const unit = await publishedUnit('overtaken', 40);
		git(
			unit.repo.root,
			'update-ref',
			`refs/heads/${unitRef('successor', 'x1-S2-g1')}`,
			'develop',
		);
		expect(await standingOf(unit)).toBe('delivered');
	});
});

describe('a publication that moved ahead of its unit', () => {
	it('is reported until the publication is merged into the unit', async () => {
		const repo = unitRepo();
		const ref = unitRef('ahead');
		const worktree = repo.enter(ref);
		repo.commit(worktree, 'slice.ts');
		const publication = ref.replace('/wip/', '/pr/');
		git(repo.root, 'update-ref', `refs/heads/${publication}`, ref);
		// the queue refreshes the pull request: a commit on the publication
		const side = repo.enter(`${publication}-refresh`);
		git(side, 'reset', '-q', '--hard', ref);
		repo.commit(side, 'refresh.ts');
		git(
			repo.root,
			'update-ref',
			`refs/heads/${publication}`,
			git(side, 'rev-parse', 'HEAD'),
		);
		const entry = async () =>
			(
				await readUnitStandings({ root: repo.root, policy: unitPolicy })
			).find((unit) => unit.ref === ref);
		expect((await entry())?.publicationAhead).toBe(true);
		expect((await entry())?.publicationRef).toBe(publication);
		const status = await runWorkUnit(['status'], {
			cwd: repo.root,
			globals: { workspace: repo.root, json: true, format: 'json' },
		});
		expect(
			(
				status.data as { publicationsAhead: { ref: string }[] }
			).publicationsAhead.map((unit) => unit.ref),
		).toEqual([ref]);
		git(worktree, 'merge', '-q', '--no-edit', publication);
		expect((await entry())?.publicationAhead).toBe(false);
	});
});
