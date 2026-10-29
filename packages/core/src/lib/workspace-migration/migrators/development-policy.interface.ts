/**
 * Contract shapes for the development-policy evidence reader.
 *
 * Split out of the implementation modules so the repo's "types live in
 * contracts" convention holds.
 */

/** What the evidence reader needs that it cannot read for itself. */
export interface IEvidenceInput {
	readonly workspaceRoot: string;
}
