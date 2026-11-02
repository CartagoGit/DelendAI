/**
 * commit-maker.interface.ts — who made a commit, as its note records it.
 */
export interface ICommitMaker {
	/** The model, as named (several instances may share it). */
	readonly agent: string;
	/** The unit it was made in: one per instance, so it tells them apart. */
	readonly unit?: string;
}
