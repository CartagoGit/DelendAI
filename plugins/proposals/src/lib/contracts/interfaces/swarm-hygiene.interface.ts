/**
 * swarm-hygiene.interface.ts — result/entry shapes for the
 * `<prefix>_swarm_hygiene` tool (f00075 S2 + f00091 S2/S4).
 *
 * Per repo convention every interface/type lives under
 * `contracts/interfaces/`. The engine (`shared/swarm-hygiene-engine.ts`)
 * and tool import these; the engine keeps only its own coupled
 * `ISwarmHygieneEngineOptions` (which binds the injected `IGitRunner`).
 */
import type { IGcPlanEntry } from '../../shared/branch-gc-engine';
import type { IPendingIntegrationEntry } from './pending-integration.interface';

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

/**
 * f00091 S4a: a worktree branch whose name does not follow the swarm
 * convention (`agent/<...>`). The m3 incident created `feat/*`,
 * `claude/*` branches on worktrees; those escape `agent/`-filtered
 * tooling (branch-status, branch-gc) and become invisible. Read-only —
 * we only report so a human can rename/integrate deliberately.
 */
export interface INonConformingBranch {
	readonly path: string;
	readonly branch: string;
	readonly head: string;
	readonly reason: 'non-agent-prefix';
}

/**
 * f00091 S4b: a worktree whose branch is unmerged into base AND has
 * fallen far behind it (`behind > staleBehindThreshold`). Such a branch
 * diverged long ago and carries work base does not; pruning it would
 * lose that work. Read-only rescue signal.
 */
export interface IStaleUnmergedWorktree {
	readonly path: string;
	readonly branch: string;
	readonly ahead: number;
	readonly behind: number;
	readonly lastCommitMinutesAgo: number;
}

/**
 * R-2026-08-31: branches that look like rescue candidates by the
 * `ahead > 0 && !mergedIntoBase` rule but are actually residual smoke
 * artifacts (single-commit, authored by the reserved `smoke-tester`
 * identity, recent). These used to block `auto_work` permanently; the
 * engine now classifies them separately and the auto_work front-hook
 * ignores them when deciding whether to refuse the cascade.
 *
 * `smoke-residual` branches SHOULD be deleted by the operator with
 * `git branch -D <branch>` (or `proposals_branch_gc { dryRun: false }`
 * once they're older than the configured GC threshold). Surfacing them
 * keeps the operator informed without gating the swarm.
 */
export interface ISmokeResidualBranch {
	readonly branch: string;
	readonly ahead: number;
	readonly behind: number;
	readonly lastCommitMinutesAgo: number;
	readonly authorEmail: string;
	readonly head: string;
	readonly reason: 'smoke-author' | 'single-commit-recent' | 'no-real-author';
}

export interface ISwarmHygieneResult {
	readonly ok: true;
	readonly baseBranch: string;
	readonly generatedAt: string;
	readonly rescueCandidates: readonly IRescueCandidate[];
	readonly gcEligible: readonly IGcPlanEntry[];
	/** R-2026-08-31: rescue-candidate lookalikes that are smoke artifacts. */
	readonly smokeResiduals: readonly ISmokeResidualBranch[];
	readonly outOfCache: readonly IOutOfCacheWorktree[];
	/**
	 * Branch checked out in the main (shared) checkout. Empty when
	 * detached. The main checkout must stay on `baseBranch`.
	 */
	readonly mainCheckoutBranch: string;
	/**
	 * `true` when the main checkout is on a branch other than
	 * `baseBranch` — an agent switched the shared checkout instead of
	 * working inside its own worktree.
	 */
	readonly mainCheckoutDrift: boolean;
	/**
	 * f00091 S2: branches `close_slice` recorded as finished-but-not-yet
	 * -integrated. Entries whose branch has since merged into base are
	 * pruned out (the caller passes a `pruneIntegrated` callback).
	 */
	readonly pendingIntegration: readonly IPendingIntegrationEntry[];
	/** f00091 S4a: worktree branches that break the `agent/` convention. */
	readonly nonConformingBranches: readonly INonConformingBranch[];
	/** f00091 S4b: unmerged worktrees that have fallen stale behind base. */
	readonly staleUnmerged: readonly IStaleUnmergedWorktree[];
	readonly summary: {
		readonly rescueCandidatesCount: number;
		readonly gcEligibleCount: number;
		readonly outOfCacheCount: number;
		readonly pendingIntegrationCount: number;
		readonly nonConformingBranchesCount: number;
		readonly staleUnmergedCount: number;
		readonly smokeResidualsCount: number;
	};
}

export interface ISwarmHygieneFailure {
	readonly ok: false;
	readonly reason: string;
	readonly baseBranch?: string;
}

export type ISwarmHygieneOutcome = ISwarmHygieneResult | ISwarmHygieneFailure;
