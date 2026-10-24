/**
 * Contract shapes for `./release-checkout.script`.
 */

/** Which paths may be returned to the integration branch, and which not. */
export interface IReleasePlan {
	/** Provably identical to what was published: safe to restore. */
	readonly release: readonly string[];
	/** Different, absent, or never published: left exactly as they are. */
	readonly keep: readonly string[];
}

/** What the operator is told. */
export interface IReleaseVerdict {
	readonly integration: string;
	readonly released: readonly string[];
	readonly kept: readonly string[];
}
