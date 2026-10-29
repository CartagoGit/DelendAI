/** Contracts for `harden-git-hooks.script.ts`. */

/** What one hardening pass changed. */
export interface IHardenReport {
	/** Hooks rewritten by this pass. */
	readonly hardened: readonly string[];
	/** Hooks left alone: not lefthook's, or already hardened. */
	readonly skipped: readonly string[];
}
