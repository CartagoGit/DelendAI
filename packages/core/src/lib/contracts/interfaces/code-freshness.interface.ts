/**
 * code-freshness.interface.ts — whether the code a server runs is still
 * the code its checkout holds, as `<prefix>_status` reports it.
 */
export interface ICodeFreshness {
	/** True when the server runs code its checkout has since changed. */
	readonly stale: boolean;
	/** What changed, as the stale-runtime watch says it. */
	readonly reason?: string;
	/** What to do about it, when stale. */
	readonly next?: string;
}
