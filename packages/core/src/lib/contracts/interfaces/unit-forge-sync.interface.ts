/**
 * unit-forge-sync.interface.ts — what a start did to bring each unit in
 * step with the forge.
 */

export type IUnitForgeSyncOutcome =
	/** This clone had commits the forge lacked; they were pushed. */
	| 'pushed'
	/** The forge had commits this clone lacked; the unit moved forward. */
	| 'fast-forwarded'
	/** A unit made on another machine; its branch now exists here too. */
	| 'fetched'
	/** Uncommitted edits of a unit nobody is working in were committed and pushed. */
	| 'kept-uncommitted'
	/** Both sides moved: nothing was overwritten; `repair` reconciles it. */
	| 'diverged'
	/** Something could not be done; `detail` says what. */
	| 'failed';

export interface IUnitForgeSync {
	readonly branch: string;
	readonly outcome: IUnitForgeSyncOutcome;
	readonly detail?: string;
	readonly repair?: string;
}
