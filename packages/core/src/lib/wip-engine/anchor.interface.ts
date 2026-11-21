/**
 * Contract shapes for `./anchor`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `anchor.ts` keeps the
 * behaviour, this file keeps the shapes. Re-exported from `anchor.ts`,
 * so no import site changes.
 */

/**
 * What the policy demands of the visible checkout. Built from
 * `workspace.anchoredToIntegrationBranch` and `branches.integration` —
 * never from a literal branch name, so a project that integrates on
 * `next` gets the invariant on `next`.
 */
export interface IAnchorRequirement {
	/** False for the worktree model, where owning a branch is the point. */
	readonly required: boolean;
	/** The branch the shared checkout must stay attached to. */
	readonly branch: string;
}

/** What the checkout was actually found to be. */
export type IAnchorVerdict =
	/** This policy does not anchor the checkout. Nothing to check. */
	| { readonly kind: 'not-required' }
	| { readonly kind: 'anchored'; readonly branch: string }
	/** HEAD is on a branch, but not the one the workspace is built on. */
	| {
			readonly kind: 'wrong-branch';
			readonly expected: string;
			readonly actual: string;
	  }
	/** HEAD points at a commit directly — it belongs to no branch. */
	| { readonly kind: 'detached' }
	/**
	 * The branch could not be read at all. Deliberately its own verdict:
	 * "we could not tell" is not "it is fine". A caller that treats it as
	 * a pass has invented the very guarantee this exists to prove.
	 */
	| { readonly kind: 'unreadable'; readonly reason: string };
