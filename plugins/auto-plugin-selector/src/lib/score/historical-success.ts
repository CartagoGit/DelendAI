/**
 * historical-success.ts — r00025 S3: historical success signal for
 * plugin selection.
 *
 * Pure: no I/O, no clock, no random. The selector passes in the
 * per-plugin success rate observed locally by `usage-tracking`. When
 * the host has no observation — cold start, freshly checked-out
 * plugin, or `usage-tracking` disabled — we return the neutral
 * `0.5` so a candidate with no history is treated equally to a
 * candidate with mediocre history.
 *
 * Scoring semantics:
 *  - Missing `successRate` or `observedCalls === 0`: neutral `0.5`.
 *  - Otherwise: linearly maps `successRate ∈ [0, 1]` to
 *    `[0, 1]`, lightly shrunk toward 0.5 when `observedCalls` is
 *    small so a single successful call does not dominate.
 *
 * The shrink factor is intentionally gentle — a plugin with one
 * observed call and 100% success still earns `~0.5`, not `1.0`,
 * because one data point is not evidence.
 */
const MIN_OBSERVED_FOR_FULL_CONFIDENCE = 50;

/** Inputs accepted by `scoreHistoricalSuccess`. */
export interface IHistoricalSuccessInput {
	/** Success rate in `[0, 1]`. `null` means "no observation yet". */
	readonly successRate?: number | null | undefined;
	/** How many invocations contributed to the success rate. */
	readonly observedCalls?: number | undefined;
}

/**
 * Score the historical-success signal for one candidate. Range
 * `0..1`: `1` means high observed success with enough samples,
 * `0` means near-zero success, and `0.5` means no observation.
 */
export const scoreHistoricalSuccess = (
	input: IHistoricalSuccessInput,
): number => {
	const rate = input.successRate;
	const observed = input.observedCalls ?? 0;
	if (rate === null || rate === undefined) return 0.5;
	if (!Number.isFinite(rate)) return 0.5;
	if (observed <= 0) return 0.5;
	const clampedRate = Math.max(0, Math.min(1, rate));
	// Confidence factor: 0 when observed=0, 1 when observed >= threshold.
	const confidence = Math.min(1, observed / MIN_OBSERVED_FOR_FULL_CONFIDENCE);
	// Blend the observed rate with the neutral 0.5 by `1 - confidence`,
	// so a single observation is mostly noise.
	const blended = 0.5 * (1 - confidence) + clampedRate * confidence;
	return Math.max(0, Math.min(1, blended));
};
