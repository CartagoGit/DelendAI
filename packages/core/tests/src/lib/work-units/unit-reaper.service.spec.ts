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

	it('removes a delivered unit that merged the integration branch in afterwards', async () => {
		const { repo, ref, worktree, start } = await deliveredUnit('caught-up');
		repo.commit(repo.root, 'later.ts');
		git(
			worktree,
			'merge',
			'-q',
			'--no-ff',
			'-m',
			'merge develop',
			'develop',
		);
		const [reaped] = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('removed');
		expect(git(repo.root, 'branch', '--list', ref)).toBe('');
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

describe('a landed unit whose proposal awaits its hand-off', () => {
	it('is kept while the proposal is in progress and reaped once it is in review', async () => {
		const repo = unitRepo();
		const start = wall();
		const ref = unitRef('handoff', 'x7-S1-g1');
		const worktree = repo.enter(ref);
		await recordUnitEntered({
			cwd: repo.root,
			ref,
			owner: { agent: 'handoff', session: 's' },
			worktree,
			now: start - 900 * MINUTE,
		});
		const dir = join(worktree, 'docs/delendai/proposals/in-progress');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'x7-the-proposal.md'), '# x7\n');
		git(worktree, 'add', '-A');
		git(worktree, 'commit', '-q', '-m', 'feat: x7');
		git(repo.root, 'merge', '-q', '--no-ff', '-m', 'merge x7', ref);
		const standing = async () =>
			(
				await readUnitStandings({
					root: repo.root,
					policy: unitPolicy,
					now: start,
				})
			).find((entry) => entry.ref === ref)?.standing;
		expect(await standing()).toBe('idle');
		git(
			worktree,
			'mv',
			'docs/delendai/proposals/in-progress/x7-the-proposal.md',
			'docs/delendai/proposals/x7-the-proposal.md',
		);
		git(worktree, 'commit', '-q', '-m', 'chore: hand x7 to review');
		git(repo.root, 'merge', '-q', '--no-ff', '-m', 'merge review', ref);
		expect(await standing()).toBe('delivered');
	});
});

describe('a unit whose owner left before committing anything', () => {
	/** Entered, never committed to, quiet for `silentMinutes`. */
	const emptyUnit = async (agent: string, silentMinutes: number) => {
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
		return { repo, ref, worktree, start };
	};

	it('is removed once it is abandoned: its branch holds nothing', async () => {
		const { repo, ref, worktree, start } = await emptyUnit('gone', 600);
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

	it('is left while it is only idle: its owner may still start', async () => {
		const { repo, worktree, start } = await emptyUnit('quiet', 90);
		const reaped = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped).toEqual([]);
		expect(existsSync(worktree)).toBe(true);
	});

	it('is left when it carries a commit of its own, however long it is quiet', async () => {
		const { repo, ref, worktree, start } = await emptyUnit('wrote', 600);
		repo.commit(worktree, 'unmerged.ts');
		const reaped = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped).toEqual([]);
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
	});

	it('keeps an edit its owner left uncommitted, and says which', async () => {
		const { repo, worktree, start } = await emptyUnit('drafted', 600);
		writeFileSync(join(worktree, 'draft.ts'), 'export {};\n');
		const [reaped] = await reapDeliveredUnits({
			root: repo.root,
			policy: unitPolicy,
			apply: true,
			now: start,
		});
		expect(reaped?.outcome).toBe('kept');
		expect(reaped?.edited).toContain('draft.ts');
		expect(existsSync(worktree)).toBe(true);
	});
});
