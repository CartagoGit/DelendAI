/**
 * Contract shapes for `./overlap`.
 */

/** What a change touches: the test zones it reaches, and its files. */
export interface IChangeFootprint {
	/** `everything` when the planner cannot bound what it reaches. */
	readonly zones: ReadonlySet<string> | 'everything';
	readonly files: ReadonlySet<string>;
	/**
	 * The zones it reaches only because their specs read a file it changed;
	 * none when unknown, which reads as "by its code".
	 */
	readonly readOnly?: ReadonlySet<string>;
	/**
	 * The specs that read its files, in the zones it only reads: all it
	 * reaches there. Absent when unknown, which keeps the answer by zone.
	 */
	readonly readers?: ReadonlySet<string>;
	/** It adds a file that existed nowhere before (a move adds none). */
	readonly creates?: boolean;
}
