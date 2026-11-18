/**
 * shared-checkout-clean.ts — under a work-ref model nothing is edited in
 * the shared checkout: every unit of work has a worktree of its own.
 *
 * On 2026-11-04 a subagent edited ten files in the shared checkout instead
 * of its unit's worktree, then copied them into its work ref with `work
 * checkpoint --paths`, the route the work-model instructions offered. A
 * checkpoint taken from the shared checkout takes whatever is there,
 * whoever wrote it, and one taken from a clean file there reverts the
 * unit's own work in its ref. These are the readings every route asks:
 * whether units have worktrees, and what to say when the shared checkout
 * holds edits nobody will commit.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { RESCUE_COMMAND } from '../contracts/constants/work-rescue.constant';
import { persistenceRouteKind } from './resolve';

const LISTED_PATHS = 5;

/**
 * True when `work enter` gives every unit a worktree of its own: every
 * policy whose work persists to work refs. Files reach a unit's ref from
 * that worktree, by commit, and from nowhere else.
 */
export const unitsHaveWorktrees = (
	policy: IResolvedDevelopmentPolicy,
): boolean => persistenceRouteKind(policy) === 'wip-ref';

/**
 * True when the shared checkout must stay clean: it is pinned to the
 * integration branch and every unit edits in its own worktree, so an edit
 * there belongs to no unit and is committed by nobody.
 */
export const sharedCheckoutStaysClean = (
	policy: IResolvedDevelopmentPolicy,
): boolean => policy.workspace.pinnedCheckout && unitsHaveWorktrees(policy);

/** `a, b, c and 2 more`, sorted, for a sentence. */
export const listedPaths = (paths: readonly string[]): string => {
	const sorted = [...paths].sort();
	const shown = sorted.slice(0, LISTED_PATHS).join(', ');
	return sorted.length > LISTED_PATHS
		? `${shown} and ${String(sorted.length - LISTED_PATHS)} more`
		: shown;
};

/** Why nothing proceeds while the shared checkout holds loose edits. */
export const looseEditsRefusal = (
	sharedRoot: string,
	paths: readonly string[],
): { readonly reason: string; readonly remedy: string } => ({
	reason: `The shared checkout at ${sharedRoot} holds ${String(paths.length)} loose edit(s): ${listedPaths(paths)}. Nothing is edited there: every unit has its own worktree, so no work command and no commit runs while the shared checkout holds edits nobody will commit.`,
	remedy: `Run \`${RESCUE_COMMAND}\`: it keeps them under a ref, says which, and restores the shared checkout; their owner takes them into a unit's worktree from that ref. Never discard another agent's edits by hand.`,
});
