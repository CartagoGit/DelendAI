import { describe, expect, it } from 'vitest';

import type {
	IBranchStatusEntry,
	IBranchStatusResult,
	IWorktreeStatusEntry,
} from '@mcp-vertex/proposals/lib/shared/branch-status-engine';
import {
	type IBranchGcOutcome,
	type IGcPlanEntry,
	planGc,
} from '@mcp-vertex/proposals/lib/shared/branch-gc-engine';

const FIXED_NOW = Date.parse('2026-06-27T22:00:00.000Z');

const wt = (
	overrides: Partial<IWorktreeStatusEntry>,
): IWorktreeStatusEntry => ({
	path: '/cache/.worktrees/orion',
	head: 'abc1234',
	branch: 'agent/orion',
	outOfCache: false,
	dirtyFiles: 0,
	untrackedFiles: 0,
	ageLabel: '5d',
	...overrides,
});

const status = (
	branches: IBranchStatusEntry[],
	worktrees: IWorktreeStatusEntry[],
	baseBranch = 'develop',
): IBranchStatusResult => ({
	ok: true,
	baseBranch,
	branches,
	worktrees,
	summary: {
		totalBranches: branches.length,
		totalWorktrees: worktrees.length,
		mergedCount: branches.filter((b) => b.mergedIntoBase).length,
		aheadOfBaseCount: branches.filter((b) => b.ahead > 0).length,
		behindBaseCount: branches.filter((b) => b.behind > 0).length,
		dirtyWorktrees: worktrees.filter((w) => w.dirtyFiles > 0).length,
		untrackedWorktrees: worktrees.filter((w) => w.untrackedFiles > 0)
			.length,
		outOfCacheWorktrees: worktrees.filter((w) => w.outOfCache).length,
	},
	generatedAt: new Date(FIXED_NOW).toISOString(),
});

describe('planGc', () => {
	it('removes worktrees that are merged and clean (dry-run path)', () => {
		const snapshot = status(
			[
				{
					name: 'agent/orion',
					head: 'abc1234',
					ahead: 0,
					behind: 0,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 5, // 5 days ago
					worktreePath: '/cache/.worktrees/orion',
				},
			],
			[wt({ dirtyFiles: 0, untrackedFiles: 0 })],
		);
		const { removed, skipped } = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(removed).toHaveLength(1);
		expect(skipped).toHaveLength(0);
		expect(removed[0]?.reason).toBe('merged-and-clean');
	});

	it('skips worktrees with dirty files unless force:true', () => {
		const snapshot = status(
			[
				{
					name: 'agent/orion',
					head: 'abc1234',
					ahead: 0,
					behind: 0,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 5,
					worktreePath: '/cache/.worktrees/orion',
				},
			],
			[wt({ dirtyFiles: 2, untrackedFiles: 0 })],
		);
		const { removed, skipped } = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(removed).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]?.reason).toBe('dirty');
		expect(skipped[0]?.detail).toContain('pass force:true');

		const forced = planGc(snapshot, {
			staleMinutes: 60,
			force: true,
			now: FIXED_NOW,
		});
		expect(forced.removed).toHaveLength(1);
		expect(forced.removed[0]?.reason).toBe('merged-and-clean-with-force');
	});

	it('never removes worktrees with unmerged branches (sacred)', () => {
		const snapshot = status(
			[
				{
					name: 'agent/orion',
					head: 'abc1234',
					ahead: 3,
					behind: 0,
					mergedIntoBase: false,
					lastCommitMinutesAgo: 60 * 24 * 5,
					worktreePath: '/cache/.worktrees/orion',
				},
			],
			[wt({ dirtyFiles: 0, untrackedFiles: 0 })],
		);
		const { removed, skipped } = planGc(snapshot, {
			staleMinutes: 60,
			force: true,
			now: FIXED_NOW,
		});
		expect(removed).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]?.reason).toBe('unmerged');
	});

	it('skips fresh worktrees that have not yet aged past staleMinutes', () => {
		const snapshot = status(
			[
				{
					name: 'agent/orion',
					head: 'abc1234',
					ahead: 0,
					behind: 0,
					mergedIntoBase: false,
					lastCommitMinutesAgo: 5, // 5 minutes ago
					worktreePath: '/cache/.worktrees/orion',
				},
			],
			[wt({ dirtyFiles: 0, untrackedFiles: 0 })],
		);
		const { removed, skipped } = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(removed).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]?.reason).toBe('fresh');
	});

	it('protects protected branches (main, release/x)', () => {
		const snapshot = status(
			[
				{
					name: 'main',
					head: 'abc1234',
					ahead: 0,
					behind: 0,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 5,
					worktreePath: '/cache/.worktrees/main',
				},
				{
					name: 'release/1.0',
					head: 'abc1234',
					ahead: 0,
					behind: 0,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 5,
					worktreePath: '/cache/.worktrees/release',
				},
			],
			[
				wt({ branch: 'main', path: '/cache/.worktrees/main' }),
				wt({
					branch: 'release/1.0',
					path: '/cache/.worktrees/release',
				}),
			],
		);
		const { removed, skipped } = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(removed).toHaveLength(0);
		expect(skipped).toHaveLength(2);
		expect(skipped.map((s) => s.reason)).toEqual([
			'protected-branch',
			'protected-branch',
		]);
	});

	it('skips detached HEADs', () => {
		const snapshot = status(
			[
				{
					name: 'agent/orion',
					head: 'abc1234',
					ahead: 0,
					behind: 0,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 5,
					worktreePath: '/cache/.worktrees/orion',
				},
			],
			[wt({ branch: '' })],
		);
		const { removed, skipped } = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(removed).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]?.reason).toBe('no-branch');
	});
});

// Smoke check on the result-shape union — keeps the dts surface honest.
describe('IBranchGcOutcome', () => {
	it('produces structured failures when the status engine fails', async () => {
		// We only check the union shape; the engine itself is exercised
		// by `branch-status-engine.spec.ts`.
		const sample: IBranchGcOutcome = {
			ok: false,
			reason: 'snapshot failed',
			baseBranch: 'develop',
			dryRun: true,
		};
		expect(sample.ok).toBe(false);
	});
});

// Marker type check — keeps the export tree in sync with the spec.
const _entry: IGcPlanEntry = {
	path: '/cache/.worktrees/orion',
	branch: 'agent/orion',
	reason: 'merged-and-clean',
	dirtyFiles: 0,
	untrackedFiles: 0,
	outOfCache: false,
	ageLabel: '5d',
};
void _entry;
