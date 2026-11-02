/**
 * cost-tier.constant.ts — the prices a proposed provider's cost tier is
 * read from, in US dollars per million tokens (its dearer half).
 */

/** Tier 2: up to this price. Tier 1 is what costs nothing. */
export const CHEAP_TIER_CEILING = 0.5;
/** Tier 3: up to this price. */
export const STANDARD_TIER_CEILING = 3;
/** Tier 4: up to this price; anything dearer is tier 5. */
export const PREMIUM_TIER_CEILING = 15;

/** The highest price of tiers 1 to 5, in order. */
export const COST_TIER_CEILINGS: readonly number[] = [
	0,
	CHEAP_TIER_CEILING,
	STANDARD_TIER_CEILING,
	PREMIUM_TIER_CEILING,
	Number.POSITIVE_INFINITY,
];
