/**
 * reclaim-orphans.script.spec.ts — pure engine tests.
 *
 * Pins the classification contract:
 *
 *   1. `ahead === 0` → `delete-safe` (lossless delete).
 *   2. `ahead > 0`  → `needs-review` (unique commits).
 *   3. Protected branches (`develop`, `main`, `master`) and the current
 *      branch are skipped, never classified as orphans.
 *   4. Stashes pass through untouched (always need human/LLM review).
 *
 * Imports the script as a module so the test never invokes
 * `process.exit` — the `if (import.meta.main)` guard at the bottom
 * of the script keeps the side effects out of the import graph.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import type { IUnitStandingEntry } from '@delendai/core/lib/work-units/unit-lease.interface';

import {
	buildReclaimReport,
	classifyBranch,
	renderReport,
	type IOrphanBranch,
	type IOrphanStash,
} from './reclaim-orphans.script';

const branch = (name: string, ahead: number, behind = 0): IOrphanBranch => ({
	name,
	ahead,
	behind,
	lastCommitIso: '2026-08-24T00:00:00+00:00',
	diffStat: ' 1 file changed, 3 insertions(+)',
});

const stash = (ref: string, message: string): IOrphanStash => ({
	ref,
	branch: 'develop',
	message,
	date: '2026-08-24T00:00:00+00:00',
});

describe('classifyBranch', () => {
	it('marks ahead === 0 as delete-safe', () => {
		expect(classifyBranch(branch('agent/x', 0))).toBe('delete-safe');
	});

	it('marks ahead > 0 as needs-review', () => {
		expect(classifyBranch(branch('agent/x', 3))).toBe('needs-review');
	});
});

describe('buildReclaimReport', () => {
	it('splits branches into delete-safe and needs-review', () => {
		const report = buildReclaimReport({
			branches: [branch('agent/gone', 0), branch('agent/wip', 4)],
			stashes: [],
			currentBranch: 'develop',
			protectedBranches: ['develop', 'main', 'master'],
		});
		expect(report.deleteSafeBranches.map((b) => b.name)).toEqual([
			'agent/gone',
		]);
		expect(report.reviewBranches.map((b) => b.name)).toEqual(['agent/wip']);
	});

	it('skips protected branches and the current branch', () => {
		const report = buildReclaimReport({
			branches: [
				branch('develop', 0),
				branch('main', 0),
				branch('master', 1),
				branch('my-current', 0),
				branch('agent/orphan', 0),
			],
			stashes: [],
			currentBranch: 'my-current',
			protectedBranches: ['develop', 'main', 'master'],
		});
		expect(report.deleteSafeBranches.map((b) => b.name)).toEqual([
			'agent/orphan',
		]);
		expect([...report.skipped].sort()).toEqual([
			'develop',
			'main',
			'master',
			'my-current',
		]);
	});

	it('passes stashes through untouched', () => {
		const report = buildReclaimReport({
			branches: [],
			stashes: [
				stash('stash@{0}', 'WIP refactor'),
				stash('stash@{1}', 'draft'),
			],
			currentBranch: 'develop',
			protectedBranches: ['develop', 'main', 'master'],
		});
		expect(report.stashes.map((s) => s.ref)).toEqual([
			'stash@{0}',
			'stash@{1}',
		]);
	});

	it('returns empty buckets for a clean repo', () => {
		const report = buildReclaimReport({
			branches: [],
			stashes: [],
			currentBranch: 'develop',
			protectedBranches: ['develop', 'main', 'master'],
		});
		expect(report.deleteSafeBranches).toHaveLength(0);
		expect(report.reviewBranches).toHaveLength(0);
		expect(report.stashes).toHaveLength(0);
	});
});

describe('units of work', () => {
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});
	const ref = (agent: string): string =>
		`delendai/wip/${agent}/implement/x1-S1-g1/work`;
	const unit = (
		agent: string,
		standing: IUnitStandingEntry['standing'],
	): IUnitStandingEntry => ({
		ref: ref(agent),
		worktree: null,
		standing,
		owner: { agent, session: 's' },
		silentSeconds: 0,
		reason: `${standing} for the test`,
	});
	const report = buildReclaimReport({
		branches: [
			branch(ref('live'), 3),
			branch(ref('quiet'), 3),
			branch(ref('gone'), 3),
			branch(ref('done'), 0),
			branch(ref('fresh'), 0),
			branch('feature/loose', 2),
		],
		units: [
			unit('live', 'live'),
			unit('quiet', 'idle'),
			unit('gone', 'abandoned'),
			unit('done', 'delivered'),
			unit('fresh', 'live'),
		],
		stashes: [],
		currentBranch: 'develop',
		protectedBranches: ['develop'],
	});

	it('never lists a live unit as an orphan, even one ahead 0', () => {
		expect(report.liveUnits.map((u) => u.branch.name)).toEqual([
			ref('live'),
			ref('fresh'),
		]);
		expect(report.deleteSafeBranches).toHaveLength(0);
		expect(report.reviewBranches.map((b) => b.name)).toEqual([
			'feature/loose',
		]);
	});

	it('sorts the others by their verdict', () => {
		expect(report.idleUnits.map((u) => u.unit.owner?.agent)).toEqual([
			'quiet',
		]);
		expect(report.abandonedUnits.map((u) => u.unit.owner?.agent)).toEqual([
			'gone',
		]);
		expect(report.deliveredUnits.map((u) => u.unit.owner?.agent)).toEqual([
			'done',
		]);
	});

	it('derives remedies from the policy and never moves the shared checkout', () => {
		const text = renderReport(report, 'develop', policy);
		expect(text).not.toContain('git switch');
		expect(text).toContain('live units (2)');
		expect(text).toContain(`delendai work abandon --ref=${ref('gone')}`);
		expect(text).toContain('delendai work enter --proposal=x1 --slice=S1');
		expect(text).toContain(
			'delendai work publish --proposal=x1 --slice=S1',
		);
		expect(text).toContain('delendai work publish');
		expect(text).not.toContain(`abandon --ref=${ref('live')}`);
		expect(text).not.toContain(`abandon --ref=${ref('quiet')}`);
	});

	it('keeps the old merge remedy only for a profile that commits directly', () => {
		const direct = resolveDevelopmentPolicy({
			development: { profile: 'shared-direct' },
		});
		expect(renderReport(report, 'develop', direct)).toContain('git switch');
	});
});
