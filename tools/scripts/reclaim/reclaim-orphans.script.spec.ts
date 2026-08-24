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

import {
	buildReclaimReport,
	classifyBranch,
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
