/**
 * Contract shapes for `./adopt`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds.
 */

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
