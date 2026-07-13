/**
 * agent-branch-convention.constant.ts — f00091.
 *
 * The naming convention for per-agent worktree branches and the base
 * branches that are never "non-conforming". A worktree branch that does
 * not start with `AGENT_BRANCH_PREFIX` (and is not a protected base)
 * escapes the `agent/`-filtered tooling (branch-status, branch-gc) and
 * so becomes invisible — exactly the m3-incident failure mode f00091 S4
 * makes observable.
 */

/** Prefix every conforming per-agent branch must start with. */
export const AGENT_BRANCH_PREFIX = 'agent/' as const;

/**
 * Base branches that never count as "non-conforming" worktree branches
 * (they are integration targets, not agent work branches).
 */
export const PROTECTED_BASE_BRANCHES: ReadonlySet<string> = new Set([
	'main',
	'master',
	'develop',
]);

/** The single reason a worktree branch is flagged non-conforming today. */
export const NON_CONFORMING_BRANCH_REASON = 'non-agent-prefix' as const;
