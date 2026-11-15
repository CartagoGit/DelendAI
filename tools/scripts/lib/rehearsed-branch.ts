/**
 * rehearsed-branch.ts — the branch a rehearsal stands in for.
 *
 * ROOT CAUSE (x01054 S3): a land rehearsal runs the project's gates in a
 * detached scratch clone, where the current branch is `HEAD`. A gate that
 * asks "which unit's proposal is in hand?" of the branch (proposal-hygiene
 * exempts a proposal reopened by its own unit) found nothing there and
 * judged differently from the unit's own worktree, which the same proof
 * had just passed. The rehearsal names the branch it stands in for in
 * the environment of its gates, and those gates read it when the checkout
 * has no branch of its own.
 *
 * The variable is not an agent marker, so a CI-shaped environment keeps it.
 */

/** The environment variable that carries the rehearsed branch. */
export const REHEARSED_BRANCH_ENV = 'DELENDAI_REHEARSED_BRANCH';

/**
 * `env` plus the rehearsed branch, when there is one: a detached HEAD
 * (`HEAD`) or an empty name names no branch, and the environment is
 * returned as it was.
 */
export const withRehearsedBranch = (
	env: NodeJS.ProcessEnv,
	branch: string | undefined,
): NodeJS.ProcessEnv =>
	branch === undefined || branch === '' || branch === 'HEAD'
		? env
		: { ...env, [REHEARSED_BRANCH_ENV]: branch };

/** The branch a gate judges for: its own, else the one being rehearsed. */
export const branchInHand = (
	current: string,
	env: NodeJS.ProcessEnv,
): string =>
	current === '' || current === 'HEAD'
		? (env[REHEARSED_BRANCH_ENV] ?? current)
		: current;
