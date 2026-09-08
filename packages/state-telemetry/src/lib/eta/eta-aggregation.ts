/**
 * eta-aggregation.ts — q00020 F3 S3 (statistics half).
 *
 * Pure, dependency-free statistics over a sample of durations. No ML,
 * no model call, no network: every number here is a sort plus an index
 * lookup.
 *
 * PERCENTILE DEFINITIONS — stated explicitly because "p80" alone is
 * ambiguous and the two families disagree on small samples, which is
 * exactly the regime the ETA engine lives in (5..30 samples):
 *
 *   `percentileNearestRank(xs, q)`   — the *inclusive nearest-rank*
 *     definition (NIST / "order statistic"): sort ascending, take the
 *     element at 1-based rank `ceil(q * n)`, clamped to `[1, n]`. It
 *     always returns an OBSERVED value, never an interpolated one, so
 *     a p80 can never land between two real durations and invent a
 *     duration that never happened. This is what `p80` uses.
 *
 *   `percentileLinear(xs, q)`        — linear interpolation between
 *     the two neighbouring order statistics (the R type-7 / Excel
 *     `PERCENTILE.INC` definition): position `h = (n - 1) * q`, result
 *     `xs[floor(h)] + (h - floor(h)) * (xs[floor(h)+1] - xs[floor(h)])`.
 *
 *   `median(xs)`                     — `percentileLinear(xs, 0.5)`,
 *     i.e. the classic rule: middle value for an odd count, mean of
 *     the two central values for an even count. It is deliberately NOT
 *     `percentileNearestRank(xs, 0.5)` (which would pick the upper of
 *     the two central values and bias the p50 high).
 *
 * Both functions ignore the original order of the input and never
 * mutate it.
 */

const sortedAscending = (samples: readonly number[]): number[] =>
	[...samples].sort((left, right) => left - right);

const clampQuantile = (quantile: number): number => {
	if (!Number.isFinite(quantile)) return 0;
	if (quantile < 0) return 0;
	if (quantile > 1) return 1;
	return quantile;
};

/**
 * Inclusive nearest-rank percentile. Returns an observed sample.
 * Empty input returns `undefined` — the caller decides what an
 * unknown percentile means, this module never invents a zero.
 */
export const percentileNearestRank = (
	samples: readonly number[],
	quantile: number,
): number | undefined => {
	if (samples.length === 0) return undefined;
	const sorted = sortedAscending(samples);
	const q = clampQuantile(quantile);
	const rank = Math.max(
		1,
		Math.min(sorted.length, Math.ceil(q * sorted.length)),
	);
	return sorted[rank - 1];
};

/**
 * Linear-interpolation percentile (R type-7). May return a value that
 * lies between two observed samples.
 */
export const percentileLinear = (
	samples: readonly number[],
	quantile: number,
): number | undefined => {
	if (samples.length === 0) return undefined;
	const sorted = sortedAscending(samples);
	if (sorted.length === 1) return sorted[0];
	const q = clampQuantile(quantile);
	const position = (sorted.length - 1) * q;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lower = sorted[lowerIndex] as number;
	const upper = sorted[upperIndex] as number;
	if (lowerIndex === upperIndex) return lower;
	return lower + (position - lowerIndex) * (upper - lower);
};

/**
 * Median: middle value (odd n), mean of the two central values
 * (even n). Empty input returns `0` only for the internal guard in
 * `duration-history.ts`; prefer `medianOrUndefined` when the
 * difference matters.
 */
export const median = (samples: readonly number[]): number =>
	medianOrUndefined(samples) ?? 0;

export const medianOrUndefined = (
	samples: readonly number[],
): number | undefined => percentileLinear(samples, 0.5);
