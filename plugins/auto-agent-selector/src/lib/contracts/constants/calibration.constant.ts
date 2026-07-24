/**
 * calibration.constant.ts — the two documented knobs for empirical
 * calibration (S4). Kept as data so the blend stays explainable.
 */

/**
 * Minimum recorded samples before a provider's win-rate is allowed to
 * influence ranking. Below this, the measured signal is too noisy and the
 * router falls back to the pure cost↔quality dial.
 */
export const MIN_CALIBRATION_SAMPLES = 3;

/**
 * How strongly a measured win-rate nudges the score:
 *   bonus = CALIBRATION_WEIGHT × (winRate − 0.5)
 * so a perfect record adds +2 and a hopeless one −2. Deliberately bounded so
 * it refines within/near a cost tier without overpowering the dial at its
 * extremes (fitScore spans roughly ±25 across tiers), yet becomes the primary
 * signal at the neutral dial (5), where cost is a wash.
 */
export const CALIBRATION_WEIGHT = 4;
