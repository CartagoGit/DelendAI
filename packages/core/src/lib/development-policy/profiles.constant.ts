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
/**
 * What a workspace gets when nothing is configured.
 *
 * It was `shared-direct`: no work ref at all, every agent committing
 * straight onto the integration branch in the shared tree. So a project
 * that adopted delendai without choosing a profile gave its agents
 * nowhere to work but the shared checkout — while every guard built for
 * the work-ref model refused them with "this profile has no work-ref
 * model". The whole model applied only to the two `shared-checkout-*`
 * profiles: in practice, only to projects whose forge has pull requests
 * AND whose integration branch is protected by them.
 *
 * `shared-checkout-merge` is the one that asks nothing of the forge. Every
 * agent gets a ref of its own, the checkout stays on the integration
 * branch, and the work is certified by the LOCAL gate before it lands —
 * no pull request, no review object, no branch protection, nothing that a
 * plain git remote cannot do. Projects that want a pull request say so;
 * projects that want nothing between an edit and the branch still have
 * `shared-direct`.
 *
 * Choosing the weakest model as the default made the strongest guarantees
 * opt-in, which is backwards for a default.
 */
export const DEFAULT_DEVELOPMENT_PROFILE: IDevelopmentProfile =
	'shared-checkout-merge';

/**
 * The kinds of work a unit can carry, named in its ref (f00644). Closed
 * on purpose: a kind outside this list is refused, so a typo never
 * becomes a new kind, and a new kind is added here and nowhere else.
 */
export const WORK_KINDS = [
	'implement',
	'review',
	'create',
	'revise',
	'audit',
	'retire',
	'repair',
] as const;

/** The kind a unit has when nothing names one. */
export const DEFAULT_WORK_KIND = 'implement';

/** The placeholders a work-ref template may use, in one list. */
export const WORK_REF_PLACEHOLDERS = [
	'agent',
	'kind',
	'proposal',
	'slice',
	'generation',
	'topic',
] as const;

/**
 * The shape of a work ref, after its namespace: who, what kind of work,
 * on what, and what it is about. Stated ONCE — `resolve.ts` used to
 * re-spell it when a project set a namespace prefix, so the two disagreed
 * the moment either changed, and a project with a prefix silently got
 * the other shape (x00563). Change the scheme here and every writer and
 * reader follows.
 */
export const WORK_REF_SHAPE =
	'${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}';
