/** A unit entered for a proposal that did not exist yet takes its id. */

/** What happened to the forge's copy of the old name. */
export type IAdoptedForgeBranch =
	/** The forge never had the old name. */
	| 'absent'
	/** The forge had it, and it is deleted. */
	| 'removed'
	/** The forge has it and could not be asked to drop it. */
	| 'left';

/** The outcome of `adoptProposalId`. */
export type IUnitAdoption =
	| {
			/** The checkout is no unit, or the unit already names a proposal. */
			readonly status: 'kept';
			/** The unit's name, when the checkout is a unit. */
			readonly branch?: string | undefined;
	  }
	| {
			readonly status: 'renamed';
			readonly from: string;
			readonly to: string;
			/** Whether a lease followed the unit to its new name. */
			readonly leaseMoved: boolean;
			readonly forge: IAdoptedForgeBranch;
	  }
	| {
			readonly status: 'refused';
			readonly branch: string;
			readonly reason: string;
	  };
