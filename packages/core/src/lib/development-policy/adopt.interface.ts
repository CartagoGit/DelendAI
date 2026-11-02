/**
 * Contract shapes for `./adopt`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds.
 */

/** Which forge the project's remote points at, as far as we can tell. */
export const FORGE_KINDS = ['github', 'gitlab', 'other', 'none'] as const;
export type IForgeKind = (typeof FORGE_KINDS)[number];

/**
 * What `delendai init` may learn about the project's forge before it
 * declares a model on the person's behalf. Never read at server start.
 */
export interface IAdoptionEvidence {
	readonly forge: IForgeKind;
	/**
	 * Whether this project can actually REQUIRE a check on a pull
	 * request. `undefined` means nobody could find out, which is treated
	 * as "cannot": claiming a gate we may not hold is the drift this
	 * policy exists to stop.
	 */
	readonly canRequireChecks?: boolean | undefined;
	/** Branches that exist, used to pick a release branch that is real. */
	readonly existingBranches?: readonly string[] | undefined;
}

/** The `development` block a workspace should be given. */
export interface IAdoptionBlock {
	readonly profile: string;
	readonly branches: {
		readonly integration: string;
		readonly release: string;
	};
}

/** The `development` block to write, and why each part of it was chosen. */
export interface IAdoptionProposal {
	/** `undefined` when the project already decided and must be left alone. */
	readonly block?: IAdoptionBlock | undefined;
	/** One line per decision, in the order they were made. */
	readonly reasons: readonly string[];
}
