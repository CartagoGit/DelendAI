/** Contract shape for the work-ref scope grammar (f00808). */

/** What a branch's scope component names (f00808). */
export interface IWorkScope {
	/** One proposal, or several when the unit spans proposals. */
	readonly proposals: readonly string[];
	/** The slices of a single proposal; empty for the whole proposal. */
	readonly slices: readonly string[];
	/** Whether `slices` is a `from-to` range rather than a set. */
	readonly range: boolean;
	/** From 1; spelled only from the second generation on. */
	readonly generation: number;
}
