/**
 * `IPayloadPercentile` — one explicit representation of "no samples yet"
 * for a byte-size percentile.
 *
 * The metrics longitudinal gate (f00027) previously disagreed with itself
 * across two layers: a producer emitted `p95PayloadBytes: null` when no
 * samples had been recorded, while the consumer's schema required a finite
 * number. Coercing `null` to `0` would have silently told the regression
 * gate "the payload got cheaper" when in fact nothing was ever observed —
 * corrupting the very comparison the gate exists to protect.
 *
 * A discriminated union removes the ambiguity at the type level: a caller
 * must check `hasSamples` before it can even reach `p95PayloadBytes`, so
 * "no data" and "zero bytes" can never be confused.
 *
 * This lives in `@mcp-vertex/core` (not a plugin) because it is the one
 * contract every producer plugin's `*_metrics` tool and every consumer of
 * the metrics longitudinal gate must agree on byte-for-byte. The schema and
 * its TS types are derived from a single `zod` definition below so they
 * cannot drift apart the way the producer/consumer layers once did.
 */
import z from 'zod';

export const PayloadPercentileSchema = z.discriminatedUnion('hasSamples', [
	z.object({ hasSamples: z.literal(false) }),
	z.object({
		hasSamples: z.literal(true),
		p95PayloadBytes: z.number().finite().nonnegative(),
	}),
]);

export type IPayloadPercentile = z.infer<typeof PayloadPercentileSchema>;
export type IPayloadPercentileEmpty = Extract<
	IPayloadPercentile,
	{ hasSamples: false }
>;
export type IPayloadPercentileSampled = Extract<
	IPayloadPercentile,
	{ hasSamples: true }
>;

const P95_RANK = 0.95;

/** Nearest-rank p95 over an ascending-sorted array of byte sizes. */
const nearestRankP95 = (sortedAscendingBytes: readonly number[]): number => {
	const rank = Math.ceil(sortedAscendingBytes.length * P95_RANK) - 1;
	const clampedIndex = Math.min(
		Math.max(rank, 0),
		sortedAscendingBytes.length - 1,
	);
	return sortedAscendingBytes[clampedIndex] ?? 0;
};

/** Derive the discriminated percentile from raw byte-size samples. */
export const computePayloadPercentile = (
	byteSamples: readonly number[],
): IPayloadPercentile => {
	if (byteSamples.length === 0) return { hasSamples: false };
	const sorted = [...byteSamples].sort((a, b) => a - b);
	return { hasSamples: true, p95PayloadBytes: nearestRankP95(sorted) };
};

/**
 * Generic "record a byte size, read back a count + p95" recorder. This is
 * the sampling mechanics every `*_metrics_registry` in a producer plugin
 * needs — the only thing that varies per plugin is the vocabulary around
 * it (a `calls` counter vs. an `activations` counter, `recordResponseBytes`
 * vs. `recordActivation`). Plugins wrap this with their own domain-specific
 * registry interface rather than re-implementing the sample array.
 */
export interface IByteSamplePercentileRegistry {
	record(bytes: number): void;
	sampleCount(): number;
	snapshotPercentile(): IPayloadPercentile;
	reset(): void;
}

export const createByteSamplePercentileRegistry =
	(): IByteSamplePercentileRegistry => {
		let byteSamples: number[] = [];
		return {
			record(bytes) {
				byteSamples.push(bytes);
			},
			sampleCount() {
				return byteSamples.length;
			},
			snapshotPercentile() {
				return computePayloadPercentile(byteSamples);
			},
			reset() {
				byteSamples = [];
			},
		};
	};
