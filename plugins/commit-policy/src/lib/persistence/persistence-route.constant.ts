/**
 * Constants for `./persistence-route`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `persistence-route.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `persistence-route.ts`, so no import site changes.
 */

/**
 * Git verbs that relocate the visible working tree. A policy with
 * `workspace.pinnedCheckout` forbids all of them, and the WIP engine is
 * built precisely so none of them is ever needed.
 */
export const HEAD_MOVING_GIT_VERBS = [
	'checkout',
	'switch',
	'reset',
	'rebase',
	'merge',
	'cherry-pick',
	'worktree',
] as const;
