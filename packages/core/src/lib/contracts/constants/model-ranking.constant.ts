/**
 * model-ranking.constant.ts — the documented weights of the one ranking.
 */

/** Cost tier each mode is aimed at: a review needs less than a plan. */
export const MODE_TIER = Object.freeze({
	plan: 4,
	review: 3,
	implement: 2,
	explore: 1,
} as const);

/** A provider that cannot work now: chosen only when nothing else can. */
export const UNAVAILABLE_SCORE = -10;

/** Below this many judged outcomes, a win rate is too noisy to count. */
export const MIN_CALIBRATION_SAMPLES = 5;

/** bonus = CALIBRATION_WEIGHT × (winRate − 0.5): ±2 at the extremes. */
export const CALIBRATION_WEIGHT = 4;

/** The cost↔quality dial a named preference stands for (0 strongest, 10 cheapest). */
export const COST_PREFERENCE_DIAL = Object.freeze({
	maximize: 1,
	balanced: 5,
	minimize: 9,
} as const);

/** The neutral dial, and the tier cost is measured around. */
export const NEUTRAL_DIAL = 5;
export const MID_COST_TIER = 2.5;

/** How strongly the dial weighs cost against capability. */
export const DIAL_COST_WEIGHT = 0.5;

/** A pin sorts first whatever its score, which stays visible. */
export const PIN_BOOST = 1000;
