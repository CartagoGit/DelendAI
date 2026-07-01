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

export interface ISwarmHygieneResult {
	readonly ok: true;
	readonly baseBranch: string;
	readonly generatedAt: string;
	readonly rescueCandidates: readonly IRescueCandidate[];
	readonly gcEligible: readonly IGcPlanEntry[];
	readonly outOfCache: readonly IOutOfCacheWorktree[];
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
	};
}

export interface ISwarmHygieneFailure {
	readonly ok: false;
	readonly reason: string;
	readonly baseBranch?: string;
}

export type ISwarmHygieneOutcome = ISwarmHygieneResult | ISwarmHygieneFailure;
