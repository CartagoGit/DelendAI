/**
 * Why the managed-lazy surface was declined, and which plugins caused
 * it. See `managed-lazy-demotion.ts`: one unindexed plugin sends the
 * WHOLE surface back to eager loading, so the names matter.
 */
export interface IManagedLazyDemotionNotice {
	readonly lines: readonly string[];
	readonly unindexed: readonly string[];
}
