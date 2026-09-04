import { describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import { runSwarmHygieneEngine } from '@delendai/proposals/lib/shared/swarm-hygiene-engine';
import type { IPendingIntegrationEntry } from '@delendai/proposals/lib/contracts/interfaces/pending-integration.interface';

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

const ROOT = '/ws';
const CACHE_WT = `${ROOT}/.cache/mcp-vertex/.worktrees`;
const BASE = 'develop';
const FIXED_NOW = Date.parse('2026-07-02T12:00:00.000Z');

interface IBranchFixture {
	readonly ahead: number;
	readonly behind: number;
	readonly merged: boolean;
	readonly minutesAgo: number;
	readonly head: string;
	/** Worktree path; omitted → branch has no worktree. */
	readonly worktreePath?: string;
	/** Whether `git branch --list agent/*` reports it (agent-prefixed). */
	readonly inAgentList: boolean;
}

/**
 * Any git verb that mutates repo state. `close_slice`/`swarm_hygiene` must
 * never issue one — integration is a deliberate human/orchestrator action.
 * (`branch --list …` is read-only; `branch -d/-D` is not — hence the token
 * scan below rather than a bare `branch` match.)
 */
const DESTRUCTIVE_VERBS = new Set([
	'merge',
	'rebase',
	'reset',
	'push',
	'cherry-pick',
	'checkout',
	'switch',
	'commit',
	'clean',
	'stash',
	'apply',
]);

const isDestructive = (args: readonly string[]): boolean => {
	// A `worktree remove|prune|add` or a `branch -d|-D|--delete` mutates too.
	if (
		args[0] === 'worktree' &&
		['remove', 'prune', 'add'].includes(args[1] ?? '')
	)
		return true;
	if (
		args[0] === 'branch' &&
		['-d', '-D', '--delete', '--force'].some((f) => args.includes(f))
	)
		return true;
	return args.some((a) => DESTRUCTIVE_VERBS.has(a));
};

/** Extract the branch tip from a `base...branch` / `base..branch` range. */
const tipOf = (range: string): string => {
	const sep = range.includes('...') ? '...' : '..';
	return range.split(sep).pop() ?? '';
};

const makeRunner = (
	fixtures: Readonly<Record<string, IBranchFixture>>,
	calls: string[][],
): IGitRunner => {
	const agentBranches = Object.entries(fixtures)
		.filter(([, f]) => f.inAgentList)
		.map(([name]) => name);
	const worktreeEntries = Object.entries(fixtures).filter(
		([, f]) => f.worktreePath !== undefined,
	);

	return async (args: readonly string[]) => {
		calls.push([...args]);

		// `git branch --list agent/*`  (agent-branch enumeration)
		if (
			args[0] === 'branch' &&
			args[1] === '--list' &&
			args[2] !== '--merged'
		) {
			return {
				ok: true,
				output: agentBranches.map((n) => `  ${n}`).join('\n'),
			};
		}

		// `git branch --list --merged <base> <branch>`  (merged reachability)
		if (
			args[0] === 'branch' &&
			args[1] === '--list' &&
			args[2] === '--merged'
		) {
			const branch = args[4] ?? '';
			const merged = fixtures[branch]?.merged ?? false;
			return { ok: true, output: merged ? `  ${branch}` : '' };
		}

		// `git worktree list --porcelain`
		if (args[0] === 'worktree' && args[1] === 'list') {
			const blocks = worktreeEntries.map(([name, f]) =>
				[
					`worktree ${f.worktreePath}`,
					`HEAD ${f.head}`,
					`branch refs/heads/${name}`,
				].join('\n'),
			);
			return { ok: true, output: blocks.join('\n\n') };
		}

		// `git -C <path> status --porcelain`  (clean everywhere)
		if (args.includes('status')) return { ok: true, output: '' };

		// `git -C <path> diff --shortstat base...branch`
		if (args.includes('diff')) {
			const range = args[args.length - 1] ?? '';
			const branch = tipOf(range);
			const f = fixtures[branch];
			return {
				ok: true,
				output: f
					? ` 2 files changed, ${f.ahead * 3} insertions(+)`
					: '',
			};
		}

		// `git rev-list --left-right --count base...branch`  → "behind\tahead"
		if (args[0] === 'rev-list' && args[1] === '--left-right') {
			const branch = tipOf(args[3] ?? '');
			const f = fixtures[branch];
			return { ok: true, output: f ? `${f.behind}\t${f.ahead}` : '0\t0' };
		}

		// `git rev-list --count base..branch`  → ahead gap
		if (args[0] === 'rev-list' && args[1] === '--count') {
			const branch = tipOf(args[2] ?? '');
			const f = fixtures[branch];
			return { ok: true, output: String(f ? f.ahead : 0) };
		}

		// `git log -1 --format=%ct <branch>`  → commit timestamp
		if (args[0] === 'log') {
			const branch = args[args.length - 1] ?? '';
			const f = fixtures[branch];
			const ts =
				f && f.minutesAgo >= 0
					? Math.round(FIXED_NOW / 1000 - f.minutesAgo * 60)
					: 0;
			return { ok: true, output: String(ts) };
		}

		// `git rev-parse --short <ref>`
		if (args[0] === 'rev-parse') {
			const ref = args[args.length - 1] ?? '';
			return {
				ok: true,
				output: (fixtures[ref]?.head ?? 'deadbee').slice(0, 7),
			};
		}

		return { ok: true, output: '' };
	};
};

const wtPath = (branch: string): string =>
	`${CACHE_WT}/${branch.replace(/\W+/gu, '-')}`;

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
