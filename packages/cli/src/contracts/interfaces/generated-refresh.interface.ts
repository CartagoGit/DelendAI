/** What the post-merge refresh did. */
export interface IGeneratedRefreshReport {
	/** True when the generators ran, whatever they produced. */
	readonly refreshed: boolean;
	/** True when a commit recorded what they changed. */
	readonly committed: boolean;
	/** Generators that failed; their output is left untouched. */
	readonly failed: readonly string[];
	/** The generated paths that actually changed. */
	readonly paths: readonly string[];
}
