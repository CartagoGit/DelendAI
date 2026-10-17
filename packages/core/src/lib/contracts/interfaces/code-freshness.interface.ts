/**
 * code-freshness.interface.ts — whether the code a server runs is still
 * the code its checkout holds.
 */
export interface ICodeFreshness {
	/** The commit the server's own checkout was at when it started. */
	readonly startedAt: string | null;
	/** The commit that checkout is at now. */
	readonly now: string | null;
	/**
	 * True when the checkout moved and the move changed the code the server
	 * loaded (packages/, plugins/): it is applying rules it no longer has.
	 */
	readonly stale: boolean;
	/** What to do about it, when stale. */
	readonly next?: string;
}
