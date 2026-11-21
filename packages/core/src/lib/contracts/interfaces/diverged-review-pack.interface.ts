/** A pack ref and the wip it should have been cut from. */
export interface IDivergedReviewPack {
	readonly pack: string;
	readonly wip: string;
	/** The command that brings the pack's commits into the wip. */
	readonly merge: string;
}
