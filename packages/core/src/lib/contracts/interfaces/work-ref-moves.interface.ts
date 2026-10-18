/**
 * work-ref-moves.interface.ts — what was done to a work ref on the forge,
 * and the loops that record shows.
 */

/** A removal from the forge, or a return to it. */
export type WorkRefMove = 'withdraw' | 'reap' | 'restore' | 'push';

export interface IWorkRefMoveRecord {
	/** Milliseconds since the epoch. */
	readonly at: number;
	/** The ref, without `refs/heads/`. */
	readonly ref: string;
	readonly move: WorkRefMove;
	/** The component that moved it, and the process it ran in. */
	readonly by: string;
}

/** A ref taken off the forge and put back, again and again. */
export interface IWorkRefLoop {
	readonly ref: string;
	/** How many times it was taken and put back within the window. */
	readonly cycles: number;
	/** The components that took it, and the ones that put it back. */
	readonly removedBy: readonly string[];
	readonly restoredBy: readonly string[];
}
