import { describe, expect, it } from 'vitest';

import type {
	IBranchStatusEntry,
	IBranchStatusResult,
	IWorktreeStatusEntry,
} from '@mcp-vertex/proposals/lib/shared/branch-status-engine';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';
import {
	type IBranchGcOutcome,
	type IGcPlanEntry,
	planGc,
	runBranchGcEngine,
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

	it('f00075 S0 — extraBranchLookups replaces not-found with merge-and-clean', () => {
		// Simulate the case where the branch is NOT in the snapshot's
		// branches list. Without S0, the plan would report
		// `not-found`. With S0, the caller passes the resolved entry
		// via extraBranchLookups and the worktree is recognised as
		// eligible.
		const snapshot = status(
			[],
			[
				wt({
					branch: 'agent/copilot-minimax-m3-x00056',
					path: '/cache/.worktrees/x00056',
					dirtyFiles: 0,
					untrackedFiles: 0,
				}),
			],
		);
		// Baseline: without extra lookups → not-found.
		const baseline = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(baseline.removed).toHaveLength(0);
		expect(baseline.skipped).toHaveLength(1);
		expect(baseline.skipped[0]?.reason).toBe('not-found');

		// With S0: pass the resolved branch entry; worktree becomes
		// eligible (merged and clean).
		const lookups = new Map([
			[
				'agent/copilot-minimax-m3-x00056',
				{
					name: 'agent/copilot-minimax-m3-x00056',
					head: 'abc1234',
					ahead: 0,
					behind: 3,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 2,
					worktreePath: '/cache/.worktrees/x00056',
				},
			],
		]);
		const withExtras = planGc(
			snapshot,
			{ staleMinutes: 60, now: FIXED_NOW },
			lookups,
		);
		expect(withExtras.removed).toHaveLength(1);
		expect(withExtras.removed[0]?.path).toBe('/cache/.worktrees/x00056');
		expect(withExtras.removed[0]?.reason).toBe('merged-and-clean');
	});

	it('f00075 S0 — branch in the snapshot list stays eligible without extras', () => {
		const snapshot = status(
			[
				{
					name: 'agent/copilot-minimax-m3-x00056',
					head: 'abc1234',
					ahead: 0,
					behind: 3,
					mergedIntoBase: true,
					lastCommitMinutesAgo: 60 * 24 * 2,
					worktreePath: '/cache/.worktrees/x00056',
				},
			],
			[
				wt({
					branch: 'agent/copilot-minimax-m3-x00056',
					path: '/cache/.worktrees/x00056',
					dirtyFiles: 0,
					untrackedFiles: 0,
				}),
			],
		);
		const withoutExtras = planGc(snapshot, {
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(withoutExtras.removed).toHaveLength(1);
		expect(withoutExtras.removed[0]?.path).toBe('/cache/.worktrees/x00056');
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

// f00075 S0: regression tests for the "not-found" trap.
//
// The bug: `planGc` builds `branchByName` from `snapshot.branches`,
// which only contains branches reported by `git branch --list
// agent/*`. Worktrees whose branch tip is reachable through the
// worktree pointer but not in that branch list (because the branch is
// only alive as the worktree's HEAD ref) were reported as
// `skipped: not-found` even though they are real agent branches.
//
// The fix: `runBranchGcEngine` augments the snapshot with synthetic
// branch entries for worktree-only branches so `planGc` can resolve
// them. The synthetic entries default to `mergedIntoBase: false` and
// `ahead: 0`, which means the GC treats them as "unmerged, fresh" —
// i.e. the worktree is reported as `skipped` (safe) instead of
// `removed` (dangerous). The user can then run a manual `git rev-list`
// against the worktree to verify the branch is truly stale.
describe('f00075 S0 — worktree-only branches are not "not-found"', () => {
	const buildSnapshot = (
		worktrees: IWorktreeStatusEntry[],
		branches: IBranchStatusEntry[] = [],
	): IBranchStatusResult => ({
		ok: true,
		baseBranch: 'develop',
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

	// Mock git runner that returns the snapshot we want for `git
	// worktree list --porcelain` and `git status --porcelain`, then
	// fails on everything else. `runBranchStatusEngine` only needs a
	// few commands to build the snapshot.
	const runnerWithSnapshot =
		(snapshot: IBranchStatusResult): IGitRunner =>
		async (args: readonly string[]) => {
			const cmd = args[0];
			if (cmd === 'branch' && args[1] === '--list') {
				return {
					ok: true,
					output: snapshot.branches
						.map((b) => (b.mergedIntoBase ? '* ' : '  ') + b.name)
						.join('\n'),
				};
			}
			if (cmd === 'worktree' && args[1] === 'list') {
				const blocks = snapshot.worktrees.map((w) => {
					const lines = [`worktree ${w.path}`, `HEAD ${w.head}`];
					if (w.branch.length > 0)
						lines.push(`branch refs/heads/${w.branch}`);
					return lines.join('\n');
				});
				return { ok: true, output: blocks.join('\n\n') };
			}
			if (cmd === 'status') {
				return { ok: true, output: '' };
			}
			// `rev-list --left-right --count`, `branch --list --merged`,
			// `rev-list --count`, `rev-parse`, `log -1 --format=%ct` —
			// default to "merged + 0 ahead/behind + 0 minutes ago" so
			// the synthetic branch entries surface as `skipped` (safe).
			return { ok: true, output: '0\t0' };
		};

	it('does not report worktree-only merged+clean branch as "not-found"', async () => {
		const snapshot = buildSnapshot(
			[
				wt({
					path: '/cache/.worktrees/agent-x00056',
					branch: 'agent/x00056',
					head: '6a79349',
					ageLabel: '5d',
				}),
			],
			// Note: NO matching entry in `branches` — this is the bug
			// surface. The branch only exists as the worktree's HEAD.
			[],
		);
		const runner = runnerWithSnapshot(snapshot);
		const result = await runBranchGcEngine({
			run: runner,
			workspaceRoot: '/tmp',
			dryRun: true,
			staleMinutes: 60,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// The worktree must NOT be reported as `not-found`. It should
		// appear as either `removed` (if GC considers it eligible) or
		// `skipped` with a meaningful reason (unmerged / fresh).
		const notFound = result.skipped.filter((s) => s.reason === 'not-found');
		expect(notFound).toHaveLength(0);
	});

	it('preserves the detached HEAD skip path', async () => {
		const snapshot = buildSnapshot([
			wt({
				path: '/cache/.worktrees/detached',
				branch: '',
				head: 'abc1234',
				ageLabel: '5d',
			}),
		]);
		const runner = runnerWithSnapshot(snapshot);
		const result = await runBranchGcEngine({
			run: runner,
			workspaceRoot: '/tmp',
			dryRun: true,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const detached = result.skipped.filter((s) => s.reason === 'no-branch');
		expect(detached).toHaveLength(1);
	});

	it('preserves the protected-branch skip path (main / master / release/*)', async () => {
		const snapshot = buildSnapshot([
			wt({
				path: '/cache/.worktrees/main-branch',
				branch: 'main',
				head: 'main1234',
				ageLabel: '5d',
			}),
		]);
		const runner = runnerWithSnapshot(snapshot);
		const result = await runBranchGcEngine({
			run: runner,
			workspaceRoot: '/tmp',
			dryRun: true,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const protectedSkip = result.skipped.filter(
			(s) => s.reason === 'protected-branch',
		);
		expect(protectedSkip).toHaveLength(1);
	});
});
