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

/**
 * The namespace `agent_worktree` creates its per-agent branches in.
 *
 * It is ONE way of making a working branch, not where a project's work
 * lives: a unit of work is a ref under the policy's work-ref namespace,
 * which `shared/branch-namespaces.ts` reads from the project. This stays
 * recognised for as long as `agent_worktree` creates branches here.
 */
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
