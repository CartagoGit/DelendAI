/**
 * Contract shapes for `./adopt`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds.
 */

/** Which forge the project's remote points at, as far as we can tell. */
export const FORGE_KINDS = ['github', 'gitlab', 'other', 'none'] as const;
export type TForgeKind = (typeof FORGE_KINDS)[number];

/** What the workspace looks like at the moment adoption is considered. */
export interface IAdoptionEvidence {
	/** True when the project already states a `development` block. */
	readonly hasDevelopmentBlock: boolean;
	/** The pre-policy field, when the project set one. */
	readonly agentWorktree?: boolean | undefined;
	readonly forge: TForgeKind;
	/**
	 * Whether this project can actually REQUIRE a check on a pull
	 * request. `undefined` means nobody could find out — which is not the
	 * same as `false`, and is treated as "cannot", because claiming a
	 * gate we may not hold is the drift this policy exists to stop.
	 */
	readonly canRequireChecks?: boolean | undefined;
	/**
	 * The branch the checkout is on when the project adopts the model —
	 * the branch work is already being done from.
	 */
	readonly currentBranch?: string | undefined;
	/** Branches that exist, used to pick a release branch that is real. */
	readonly existingBranches?: readonly string[] | undefined;
}

/** The `development` block to write, and why each part of it was chosen. */
export interface IAdoptionProposal {
	/** `undefined` when the project already decided and must be left alone. */
	readonly block?: Record<string, unknown> | undefined;
	/** One line per decision, in the order they were made. */
	readonly reasons: readonly string[];
}
