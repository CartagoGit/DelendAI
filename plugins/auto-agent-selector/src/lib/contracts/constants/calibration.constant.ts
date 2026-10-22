/**
 * calibration.constant.ts — the two documented knobs for empirical
 * calibration, from core's one ranking so the selector and the runner
 * weigh measured outcomes alike:
 *   - MIN_CALIBRATION_SAMPLES: judged outcomes before a win rate counts;
 *   - CALIBRATION_WEIGHT: bonus = weight × (winRate − 0.5), ±2 at the extremes.
 */
export {
	CALIBRATION_WEIGHT,
	MIN_CALIBRATION_SAMPLES,
} from '@delendai/core/contracts';
