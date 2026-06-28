/**
 * Pure engine for the `<prefix>_swarm_hygiene` tool (f00075 S2).
 *
 * Composes the three queries the orchestrator needs in one read-only
 * payload:
 *
 *   1. `rescueCandidates` — `ahead > 0 && mergedIntoBase === false`
 *      branches with unique commits that have not reached
 *      `baseBranch`. Each carries a `cherryPickHint` (copy-pasteable
 *      command) and a `diffStat` summary (read-only — the orchestrator
 *      or human decides whether to execute).
 *
 *   2. `gcEligible` — the dry-run plan from `branch_gc` (after the
 *      S0 fix). Lets the orchestrator preview exactly what would be
 *      removed in `branch_gc({ dryRun: false })` without firing it.
 *
 *   3. `outOfCache` — worktrees whose path lives outside the canonical
 *      cache dir. Always surface, never auto-remove.
 *
 * Pure over (workspaceRoot, options, IGitRunner): no filesystem
 * outside of git, never throws.
 */
import type { IGitRunner } from './git-runner';
import { runBranchGcEngine, type IGcPlanEntry } from './branch-gc-engine';
import { runBranchStatusEngine } from './branch-status-engine';

export interface IRescueCandidate {
	readonly branch: string;
	readonly ahead: number;
	readonly behind: number;
	readonly lastCommitMinutesAgo: number;
	readonly worktreePath: string;
	readonly diffStat: string;
	readonly cherryPickHint: string;
}

export interface IOutOfCacheWorktree {
	readonly path: string;
	readonly branch: string;
	readonly head: string;
	readonly lastCommitMinutesAgo: number;
}

export interface ISwarmHygieneResult {
	readonly ok: true;
	readonly baseBranch: string;
	readonly generatedAt: string;
	readonly rescueCandidates: readonly IRescueCandidate[];
	readonly gcEligible: readonly IGcPlanEntry[];
	readonly outOfCache: readonly IOutOfCacheWorktree[];
	readonly summary: {
		readonly rescueCandidatesCount: number;
		readonly gcEligibleCount: number;
		readonly outOfCacheCount: number;
	};
}

export interface ISwarmHygieneFailure {
	readonly ok: false;
	readonly reason: string;
	readonly baseBranch?: string;
}

export type ISwarmHygieneOutcome = ISwarmHygieneResult | ISwarmHygieneFailure;

export interface ISwarmHygieneEngineOptions {
	readonly run: IGitRunner;
	readonly workspaceRoot: string;
	readonly baseBranch?: string;
	readonly staleMinutes?: number;
	readonly force?: boolean;
	readonly agentPrefix?: string;
	readonly now?: number;
	/**
	 * Truncation caps so the tool stays cheap. Default 20 rescue
	 * candidates, 20 GC entries, 20 out-of-cache.
	 */
	readonly maxRescueCandidates?: number;
	readonly maxGcEligible?: number;
	readonly maxOutOfCache?: number;
}

const DEFAULT_MAX_RESCUE = 20;
const DEFAULT_MAX_GC = 20;
const DEFAULT_MAX_OUT = 20;

/** Produce a short diff-stat line via `git diff --shortstat`. */
const diffStatFor = async (
	run: IGitRunner,
	wtPath: string,
	baseBranch: string,
	branch: string,
): Promise<string> => {
	const result = await run([
		'-C',
		wtPath,
		'diff',
		'--shortstat',
		`${baseBranch}...${branch}`,
	]);
	if (!result.ok) return '';
	return result.output.trim();
};

/** Compose a copy-pasteable cherry-pick hint with the real worktree
 *  path. Falls back to a single-line `git log` review hint when the
 *  branch is not owned by a worktree (caller can still inspect the
 *  diff before committing to a strategy). */
const cherryPickHintFor = (
	branch: string,
	baseBranch: string,
	worktreePath: string,
): string => {
	if (worktreePath.length === 0) {
		return `git log ${baseBranch}..${branch}  # review the missing commits`;
	}
	return [
		`cd ${worktreePath} && \\`,
		`  git log ${baseBranch}..${branch}  # review the missing commits`,
		`  git -C ${worktreePath} fetch . ${branch}:${branch}  # (if not local)`,
		`  git -C ${worktreePath} checkout ${baseBranch} && \\`,
		`  git -C ${worktreePath} cherry-pick ${branch}~..${branch}`,
	].join(' && ');
};

/**
 * Core entry point. Snapshot the workspace, classify branches into
 * rescue / gc / out-of-cache buckets, then return a structured
 * payload. Never throws.
 */
export const runSwarmHygieneEngine = async (
	options: ISwarmHygieneEngineOptions,
): Promise<ISwarmHygieneOutcome> => {
	const baseBranch = options.baseBranch ?? 'develop';
	const maxRescue = options.maxRescueCandidates ?? DEFAULT_MAX_RESCUE;
	const maxGc = options.maxGcEligible ?? DEFAULT_MAX_GC;
	const maxOut = options.maxOutOfCache ?? DEFAULT_MAX_OUT;

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
		return { ok: false, reason: snapshot.reason, baseBranch };
	}

	// Rescue candidates: ahead > 0 && !mergedIntoBase. The branch
	// carries work that has not yet reached baseBranch and is at risk
	// of being lost when the worktree is removed or the session ends.
	const rescueCandidatesRaw = snapshot.branches.filter(
		(b) => b.ahead > 0 && !b.mergedIntoBase,
	);
	const rescueCandidates: IRescueCandidate[] = [];
	for (const branch of rescueCandidatesRaw.slice(0, maxRescue)) {
		const wtPath =
			branch.worktreePath.length > 0
				? branch.worktreePath
				: options.workspaceRoot;
		const diffStat = await diffStatFor(
			options.run,
			wtPath,
			baseBranch,
			branch.name,
		);
		rescueCandidates.push({
			branch: branch.name,
			ahead: branch.ahead,
			behind: branch.behind,
			lastCommitMinutesAgo: branch.lastCommitMinutesAgo,
			worktreePath: branch.worktreePath,
			diffStat,
			cherryPickHint: cherryPickHintFor(
				branch.name,
				baseBranch,
				branch.worktreePath,
			),
		});
	}

	// GC eligibility: reuse `runBranchGcEngine({ dryRun: true })` so
	// the S0 fix applies (resolves branch from each worktree).
	const gcResult = await runBranchGcEngine({
		run: options.run,
		workspaceRoot: options.workspaceRoot,
		baseBranch,
		dryRun: true,
		...(options.staleMinutes !== undefined
			? { staleMinutes: options.staleMinutes }
			: {}),
		...(options.force !== undefined ? { force: options.force } : {}),
		...(options.agentPrefix !== undefined
			? { agentPrefix: options.agentPrefix }
			: {}),
		...(options.now !== undefined ? { now: options.now } : {}),
	});
	const gcEligible =
		gcResult.ok && 'removed' in gcResult
			? gcResult.removed.slice(0, maxGc)
			: [];

	// Out-of-cache worktrees: any worktree whose path is outside the
	// canonical cache dir. Always flagged, never auto-removed.
	const outOfCache: IOutOfCacheWorktree[] = [];
	for (const wt of snapshot.worktrees) {
		if (!wt.outOfCache) continue;
		const branchEntry = snapshot.branches.find((b) => b.name === wt.branch);
		outOfCache.push({
			path: wt.path,
			branch: wt.branch,
			head: wt.head,
			lastCommitMinutesAgo: branchEntry?.lastCommitMinutesAgo ?? -1,
		});
		if (outOfCache.length >= maxOut) break;
	}

	const generatedAt = new Date(options.now ?? Date.now()).toISOString();
	return {
		ok: true,
		baseBranch,
		generatedAt,
		rescueCandidates,
		gcEligible,
		outOfCache: outOfCache.slice(0, maxOut),
		summary: {
			rescueCandidatesCount: rescueCandidates.length,
			gcEligibleCount: gcEligible.length,
			outOfCacheCount: outOfCache.length,
		},
	};
};
