/**
 * Constants for `./profiles`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `profiles.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `profiles.ts`, so no import site changes.
 */

import type { IDevelopmentProfile } from './profiles.interface';

/** Built-in preset ids. Projects may also write `custom` axes directly. */
export const DEVELOPMENT_PROFILES = [
	/** Shared tree, commits straight onto the integration branch. */
	'shared-direct',
	/** Shared tree, WIP refs without checkout, integrated by pull request. */
	'shared-checkout-pr',
	/**
	 * Shared tree and WIP refs, integrated by merging into the
	 * integration branch — for forges where pull requests are not part of
	 * the process, or not the project's to require.
	 */
	'shared-checkout-merge',
	/** One worktree per agent, each on a branch, integrated by pull request. */
	'worktree-pr',
] as const;

/**
 * The policy a workspace gets when nothing at all is configured. It is
 * deliberately the historical model: installing a newer delendai must not
 * silently change how an existing project integrates work.
 */
export const DEFAULT_DEVELOPMENT_PROFILE: IDevelopmentProfile = 'shared-direct';
