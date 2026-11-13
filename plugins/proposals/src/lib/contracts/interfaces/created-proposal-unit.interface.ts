/**
 * created-proposal-unit.interface.ts — what creating a proposal did to the
 * unit it was created in.
 */

/** The fields of the create result that describe the unit. */
export interface ICreatedProposalUnit {
	readonly unitBranch?: string;
	readonly unitRenamedFrom?: string;
	/** A sentence for the agent, appended to the next action. */
	readonly note?: string;
}
