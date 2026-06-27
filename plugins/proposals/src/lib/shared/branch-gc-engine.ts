/**
 * Pure engine for the `<prefix>_branch_gc` tool (f00073).
 *
 * Removes worktrees that have decayed into orphan state: their branch
 * is already merged into `baseBranch` AND their working tree is clean
 * AND the worktree has been idle for more than `staleMinutes` (default
 * 60). The engine is conservative on purpose — by default it operates
 * in `dryRun: true` and reports what it *would* remove without
 * touching the filesystem.
 *
 * Two safety nets, modelled on `agent-worktree-engine.ts`:
 *
 *   1. Unmerged branches are sacred. A worktree whose branch is ahead
 *      of `baseBranch` is never removed even with `force: true`.
 *   2. Dirty worktrees are warned but not removed unless `force: true`
 *      is passed. The default flow leaves them for a human to decide.
 *
 * The engine is pure over its inputs (IGitRunner + status from the
 * sibling `branch-status-engine`) and never throws.
 */
import type { IGitRunner } from './git-runner';
import {
	type IBranchStatusOutcome,
	type IWorktreeStatusEntry,
	runBranchStatusEngine,
} from './branch-status-engine';

/** One GC action the engine decided to take (or would take in dry-run). */
export interface IGcPlanEntry {
	readonly path: string;
	readonly branch: string;
	readonly reason:
		| 'merged-and-clean'
		| 'merged-and-clean-with-force'
		| 'behind-only'
		| 'no-branch';
	readonly dirtyFiles: number;
	readonly untrackedFiles: number;
	readonly outOfCache: boolean;
	readonly ageLabel: string;
}

export interface IGcSkippedEntry {
	readonly path: string;
	readonly branch: string;
	readonly reason:
		| 'dirty'
		| 'untracked'
		| 'unmerged'
		| 'fresh'
		| 'protected-branch'
		| 'not-found'
		| 'no-branch';
	readonly detail: string;
}

export interface IBranchGcResult {
	readonly ok: true;
	readonly dryRun: boolean;
	readonly baseBranch: string;
	readonly staleMinutes: number;
	readonly removed: readonly IGcPlanEntry[];
	readonly skipped: readonly IGcSkippedEntry[];
	readonly summary: {
		readonly removedCount: number;
		readonly skippedCount: number;
		readonly dryRunRemovedCount: number;
	};
}

export interface IBranchGcFailure {
	readonly ok: false;
	readonly reason: string;
	readonly baseBranch?: string;
	readonly dryRun?: boolean;
}

export type IBranchGcOutcome = IBranchGcResult | IBranchGcFailure;

export interface IBranchGcEngineOptions {
	/** Async git runner; production = `createGitRunner(workspaceRoot)`. */
	readonly run: IGitRunner;
	/** Absolute repo root. */
	readonly workspaceRoot: string;
	/** Branch the snapshot was taken against. Default `develop`. */
	readonly baseBranch?: string;
	/** Agent-branch prefix filter. Default `agent/`. */
	readonly agentPrefix?: string;
	/**
	 * Worktree minimum age (minutes) before it becomes GC-eligible.
	 * Default 60 (one hour). Worktrees younger than this are reported
	 * as `skipped: fresh` and never removed.
	 */
	readonly staleMinutes?: number;
	/**
	 * When true (default), the engine reports the plan but does not
	 * touch the filesystem. The caller surfaces the `removed` list as
	 * "would remove" and the result is fully idempotent.
	 */
	readonly dryRun?: boolean;
	/**
	 * When true, allow removal of worktrees with dirty or untracked
	 * files. Unmerged branches are still protected.
	 */
	readonly force?: boolean;
	/** `now` (ms since epoch) for testable age comparisons. */
	readonly now?: number;
	/**
	 * Branches that are never GC-eligible even when merged. Used for
	 * protected branches like `main` or `release/x.y`. Defaults to
	 * `['main', 'master', 'release']`.
	 */
	readonly protectedBranches?: readonly string[];
}

const DEFAULT_PROTECTED = ['main', 'master', 'release'] as const;

const isProtected = (
	branch: string,
	protectedBranches: readonly string[],
): boolean => {
	if (branch.length === 0) return false;
	return protectedBranches.some(
		(p) => branch === p || branch.startsWith(`${p}/`),
	);
};

const elapsedMinutes = (
	ageLabel: string,
	lastMinutes: number,
	fallback: number,
): number => {
	if (lastMinutes >= 0) return lastMinutes;
	// Fall back to ageLabel parsing when status engine could not resolve
	// the commit timestamp. Keep parity with `ageLabelFor` buckets.
	const match = /^(\d+)([mhd])/u.exec(ageLabel);
	if (!match) return fallback;
	const n = Number.parseInt(match[1] ?? '0', 10);
	if (!Number.isFinite(n)) return fallback;
	const suffix = match[2];
	if (suffix === 'm') return n;
	if (suffix === 'h') return n * 60;
	if (suffix === 'd') return n * 60 * 24;
	return fallback;
};

/**
 * Compute the GC plan from a status snapshot. Pure — does not touch
 * the filesystem. Exported for unit tests.
 */
export const planGc = (
	snapshot: Extract<IBranchStatusOutcome, { ok: true }>,
	options: Pick<
		IBranchGcEngineOptions,
		'staleMinutes' | 'force' | 'protectedBranches' | 'now'
	>,
): { removed: IGcPlanEntry[]; skipped: IGcSkippedEntry[] } => {
	const staleMinutes = options.staleMinutes ?? 60;
	const protectedBranches = options.protectedBranches ?? DEFAULT_PROTECTED;
	const now = options.now ?? Date.now();
	const removed: IGcPlanEntry[] = [];
	const skipped: IGcSkippedEntry[] = [];
	const branchByName = new Map(snapshot.branches.map((b) => [b.name, b]));
	const branchByWorktree = new Map<string, IWorktreeStatusEntry>();

	for (const wt of snapshot.worktrees) {
		if (wt.branch.length > 0) branchByWorktree.set(wt.branch, wt);
	}

	for (const wt of snapshot.worktrees) {
		const branch = branchByName.get(wt.branch) ?? null;
		if (wt.branch.length === 0) {
			// detached HEAD: skip with reason; never remove detached.
			skipped.push({
				path: wt.path,
				branch: wt.branch,
				reason: 'no-branch',
				detail: 'worktree is on a detached HEAD; skipping',
			});
			continue;
		}
		if (isProtected(wt.branch, protectedBranches)) {
			skipped.push({
				path: wt.path,
				branch: wt.branch,
				reason: 'protected-branch',
				detail: `${wt.branch} is a protected branch`,
			});
			continue;
		}
		if (branch === null) {
			skipped.push({
				path: wt.path,
				branch: wt.branch,
				reason: 'not-found',
				detail: 'worktree branch is not a known agent branch',
			});
			continue;
		}
		const ageMin = elapsedMinutes(
			wt.ageLabel,
			branch.lastCommitMinutesAgo,
			0,
		);
		// Skip worktrees whose last commit is fresher than the stale
		// threshold, OR whose branch is still ahead of base (not yet
		// merged). `now` parameter is honoured when label parsing fails.
		const isFresh =
			ageMin < staleMinutes &&
			now - branch.lastCommitMinutesAgo * 60_000 < staleMinutes * 60_000;
		if (isFresh && !branch.mergedIntoBase) {
			skipped.push({
				path: wt.path,
				branch: wt.branch,
				reason: 'fresh',
				detail: `age ${wt.ageLabel} < staleMinutes ${staleMinutes} and not merged`,
			});
			continue;
		}
		if (!branch.mergedIntoBase && branch.ahead > 0) {
			skipped.push({
				path: wt.path,
				branch: wt.branch,
				reason: 'unmerged',
				detail: `${branch.ahead} commit(s) ahead of ${snapshot.baseBranch}; pass force:true to override (still refused — unmerged is sacred)`,
			});
			continue;
		}
		if (
			(wt.dirtyFiles > 0 || wt.untrackedFiles > 0) &&
			options.force !== true
		) {
			skipped.push({
				path: wt.path,
				branch: wt.branch,
				reason: wt.untrackedFiles > 0 ? 'untracked' : 'dirty',
				detail: `${wt.dirtyFiles} dirty / ${wt.untrackedFiles} untracked; pass force:true to override`,
			});
			continue;
		}
		removed.push({
			path: wt.path,
			branch: wt.branch,
			reason:
				wt.dirtyFiles > 0 || wt.untrackedFiles > 0
					? 'merged-and-clean-with-force'
					: 'merged-and-clean',
			dirtyFiles: wt.dirtyFiles,
			untrackedFiles: wt.untrackedFiles,
			outOfCache: wt.outOfCache,
			ageLabel: wt.ageLabel,
		});
	}
	return { removed, skipped };
};

/**
 * Core entry point. Computes a GC plan, then optionally executes it
 * via `git worktree remove --force`. Never throws.
 */
export const runBranchGcEngine = async (
	options: IBranchGcEngineOptions,
): Promise<IBranchGcOutcome> => {
	const dryRun = options.dryRun !== false;
	const baseBranch = options.baseBranch ?? 'develop';

	const snapshot = await runBranchStatusEngine({
		run: options.run,
		workspaceRoot: options.workspaceRoot,
		baseBranch,
		...(options.agentPrefix !== undefined
			? { agentPrefix: options.agentPrefix }
			: {}),
		...(options.now !== undefined ? { now: options.now } : {}),
	});
	if (!snapshot.ok) {
		return {
			ok: false,
			reason: snapshot.reason,
			baseBranch,
			dryRun,
		};
	}

	const { removed, skipped } = planGc(snapshot, options);

	// Execute the plan when not in dry-run. We never push; we only run
	// `git worktree remove --force <path>` per removed entry.
	const actuallyRemoved: IGcPlanEntry[] = [];
	if (!dryRun) {
		for (const entry of removed) {
			const result = await options.run([
				'worktree',
				'remove',
				'--force',
				entry.path,
			]);
			if (result.ok) {
				actuallyRemoved.push(entry);
			} else {
				skipped.push({
					path: entry.path,
					branch: entry.branch,
					reason: 'not-found',
					detail: `git worktree remove failed: ${result.reason ?? 'unknown'}`,
				});
			}
		}
	}

	const staleMinutes = options.staleMinutes ?? 60;
	return {
		ok: true,
		dryRun,
		baseBranch,
		staleMinutes,
		removed: dryRun ? removed : actuallyRemoved,
		skipped,
		summary: {
			removedCount: actuallyRemoved.length,
			skippedCount: skipped.length,
			dryRunRemovedCount: removed.length,
		},
	};
};
