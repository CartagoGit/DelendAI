import { describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import { runSwarmHygieneEngine } from '@delendai/proposals/lib/shared/swarm-hygiene-engine';
import type { IPendingIntegrationEntry } from '@delendai/proposals/lib/contracts/interfaces/pending-integration.interface';
import {
	BASE,
	FIXED_NOW,
	ROOT,
	isDestructive,
	makeRunner,
	wtPath,
	type IBranchFixture,
} from './swarm-hygiene-harness';

/**
 * f00091 S3 — verify the swarm-hygiene engine is non-destructive and that
 * its rescue list is exactly the set of finished-but-unmerged branches.
 *
 * The engine is pure over `(workspaceRoot, options, IGitRunner)`; here we
 * drive a fixture-backed fake runner that (1) synthesises the git output
 * `runBranchStatusEngine` / `runBranchGcEngine` / the engine's own helpers
 * consume, and (2) records EVERY git invocation so the test can assert no
 * destructive verb is ever issued.
 */

describe('runSwarmHygieneEngine (f00091 S3 — non-destructive + accurate rescue list)', () => {
	// A representative swarm snapshot:
	//   orion — ahead 3, unmerged → RESCUE
	//   lyra  — ahead 5, unmerged → RESCUE
	//   vega  — merged, ahead 0   → NOT rescue (and prunes from pending)
	//   rogue — non-agent branch, unmerged, far behind → nonConforming + stale
	const fixtures: Record<string, IBranchFixture> = {
		'agent/orion': {
			ahead: 3,
			behind: 0,
			merged: false,
			minutesAgo: 30,
			head: 'aaa0001',
			worktreePath: wtPath('agent/orion'),
			inAgentList: true,
		},
		'agent/lyra': {
			ahead: 5,
			behind: 1,
			merged: false,
			minutesAgo: 90,
			head: 'bbb0002',
			worktreePath: wtPath('agent/lyra'),
			inAgentList: true,
		},
		'agent/vega': {
			ahead: 0,
			behind: 2,
			merged: true,
			minutesAgo: 300,
			head: 'ccc0003',
			worktreePath: wtPath('agent/vega'),
			inAgentList: true,
		},
		'feat/rogue': {
			ahead: 1,
			behind: 60,
			merged: false,
			minutesAgo: 60 * 24 * 3,
			head: 'ddd0004',
			worktreePath: wtPath('feat/rogue'),
			inAgentList: false,
		},
	};

	it('rescue list is EXACTLY the finished-but-unmerged (ahead>0 && !merged) branches', async () => {
		const calls: string[][] = [];
		const result = await runSwarmHygieneEngine({
			run: makeRunner(fixtures, calls),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.rescueCandidates.map((r) => r.branch).sort()).toEqual([
			'agent/lyra',
			'agent/orion',
		]);
		// The merged branch is never a rescue candidate.
		expect(
			result.rescueCandidates.some((r) => r.branch === 'agent/vega'),
		).toBe(false);
		// Each candidate carries a copy-pasteable, read-only cherry-pick hint
		// and a diffStat — but the hint is advisory text, not an executed op.
		const orion = result.rescueCandidates.find(
			(r) => r.branch === 'agent/orion',
		);
		expect(orion?.ahead).toBe(3);
		expect(orion?.cherryPickHint).toContain('cherry-pick');
		expect(orion?.diffStat).toContain('files changed');
		expect(result.summary.rescueCandidatesCount).toBe(2);
	});

	it('issues NO destructive git operation (merge/rebase/reset/checkout/push/worktree-remove/branch-delete)', async () => {
		const calls: string[][] = [];
		await runSwarmHygieneEngine({
			run: makeRunner(fixtures, calls),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});

		expect(calls.length).toBeGreaterThan(0);
		const destructive = calls.filter(isDestructive);
		expect(destructive).toEqual([]);
	});

	it('surfaces a non-agent worktree branch as non-conforming and (far-behind) stale-unmerged', async () => {
		const calls: string[][] = [];
		const result = await runSwarmHygieneEngine({
			run: makeRunner(fixtures, calls),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.nonConformingBranches.map((b) => b.branch)).toContain(
			'feat/rogue',
		);
		expect(result.staleUnmerged.map((b) => b.branch)).toContain(
			'feat/rogue',
		);
	});

	it('prunes pending-integration entries whose branch has merged, keeping the rest (self-healing, no git write)', async () => {
		const calls: string[][] = [];
		const pending: IPendingIntegrationEntry[] = [
			{
				branch: 'agent/orion',
				worktreePath: wtPath('agent/orion'),
				sliceId: 'S1',
				proposalId: 'f00091',
				recordedAt: '2026-07-02T00:00:00.000Z',
			},
			{
				branch: 'agent/vega', // already merged → must be pruned
				worktreePath: wtPath('agent/vega'),
				sliceId: 'S2',
				proposalId: 'f00091',
				recordedAt: '2026-07-02T00:00:00.000Z',
			},
		];
		let prunedWith: ReadonlySet<string> | undefined;

		const result = await runSwarmHygieneEngine({
			run: makeRunner(fixtures, calls),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
			readPendingIntegration: async () => pending,
			pruneIntegrated: async (branches) => {
				prunedWith = branches;
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// The merged branch drops off the surfaced list; the live one stays.
		expect(result.pendingIntegration.map((e) => e.branch)).toEqual([
			'agent/orion',
		]);
		expect(result.summary.pendingIntegrationCount).toBe(1);
		// prune was invoked with the merged set (registry bookkeeping only).
		expect(prunedWith?.has('agent/vega')).toBe(true);
		// …and still nothing destructive touched git.
		expect(calls.filter(isDestructive)).toEqual([]);
	});
});

describe('runSwarmHygieneEngine decision branches (keep, delete, unknown)', () => {
	const unmerged = (
		overrides: Partial<IBranchFixture> = {},
	): IBranchFixture => ({
		ahead: 4,
		behind: 0,
		merged: false,
		minutesAgo: 600,
		head: 'eee0005',
		worktreePath: wtPath('agent/sol'),
		inAgentList: true,
		...overrides,
	});

	/** A runner that answers `git log -1 --format=%H|%ae <branch>` with `headLine`. */
	const withHeadLine = (
		fixtures: Readonly<Record<string, IBranchFixture>>,
		headLine: { readonly ok: boolean; readonly output: string },
	): IGitRunner => {
		const base = makeRunner(fixtures, []);
		return async (args) =>
			args[0] === 'log' && args.includes('--format=%H|%ae')
				? headLine
				: base(args);
	};

	it('keeps unmerged work as a rescue candidate when its author is a person', async () => {
		const result = await runSwarmHygieneEngine({
			run: withHeadLine(
				{ 'agent/sol': unmerged() },
				{ ok: true, output: 'abc123|person@example.com' },
			),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rescueCandidates.map((r) => r.branch)).toEqual([
			'agent/sol',
		]);
		expect(result.smokeResiduals).toEqual([]);
	});

	it('sets aside a branch authored by the smoke identity as a residual, not a rescue', async () => {
		const result = await runSwarmHygieneEngine({
			run: withHeadLine(
				{ 'agent/sol': unmerged() },
				{ ok: true, output: 'abc123|Smoke@Local' },
			),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rescueCandidates).toEqual([]);
		expect(result.smokeResiduals.map((s) => [s.branch, s.reason])).toEqual([
			['agent/sol', 'smoke-author'],
		]);
	});

	it('sets aside a single fresh commit as a residual', async () => {
		const result = await runSwarmHygieneEngine({
			run: withHeadLine(
				{ 'agent/sol': unmerged({ ahead: 1, minutesAgo: 10 }) },
				{ ok: true, output: 'abc123|person@example.com' },
			),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.smokeResiduals.map((s) => s.reason)).toEqual([
			'single-commit-recent',
		]);
		expect(result.rescueCandidates).toEqual([]);
	});

	it('keeps a branch whose tip cannot be read as live work (unknown is never a residual)', async () => {
		const result = await runSwarmHygieneEngine({
			run: withHeadLine(
				{ 'agent/sol': unmerged({ ahead: 1, minutesAgo: 10 }) },
				{ ok: false, output: '' },
			),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rescueCandidates.map((r) => r.branch)).toEqual([
			'agent/sol',
		]);
		expect(result.smokeResiduals).toEqual([]);
	});

	it('lists a merged, clean, aged worktree as eligible for removal and never as a rescue', async () => {
		const result = await runSwarmHygieneEngine({
			run: makeRunner(
				{
					'agent/sol': unmerged({
						ahead: 0,
						merged: true,
						minutesAgo: 600,
					}),
				},
				[],
			),
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rescueCandidates).toEqual([]);
		expect(result.gcEligible.map((g) => g.branch)).toEqual(['agent/sol']);
	});

	it('reports the failure of the branch snapshot instead of an empty report', async () => {
		const failing: IGitRunner = async () => ({
			ok: false,
			output: '',
			reason: 'git not on PATH',
		});
		const result = await runSwarmHygieneEngine({
			run: failing,
			workspaceRoot: ROOT,
			baseBranch: BASE,
			now: FIXED_NOW,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toContain('git not on PATH');
		expect(result.baseBranch).toBe(BASE);
	});
});
