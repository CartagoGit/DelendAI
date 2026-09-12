/**
 * Contract shapes for the development-policy migrator.
 *
 * Split out of the implementation modules so the repo's "types live in
 * contracts" convention holds.
 */

/** What the evidence reader needs that it cannot read for itself. */
export interface IEvidenceInput {
	readonly workspaceRoot: string;
	readonly hasDevelopmentBlock: boolean;
	/** The pre-policy field, when the project set one. */
	readonly agentWorktree?: boolean | undefined;
}
