/**
 * payload-percentile.interface.ts — vocabulary for
 * `metrics/payload-percentile.ts`.
 *
 * `IPayloadPercentile` is one explicit representation of "no samples yet"
 * for a byte-size percentile: a discriminated union so a caller must check
 * `hasSamples` before it can even reach `p95PayloadBytes`, and "no data"
 * can never be confused with "zero bytes". Derived from the `zod` schema
 * in `payload-percentile.ts` so the type and its runtime validation cannot
 * drift apart.
 *
 * `IByteSamplePercentileRegistry` / `IResettableMetricsRegistry` are the
 * shared "record a sample, read back a snapshot, maybe reset" shapes every
 * `*_metrics_registry` in a producer plugin implements.
 */
import type { PayloadPercentileSchema } from '../../metrics/payload-percentile';
import type { z } from 'zod';

export type IPayloadPercentile = z.infer<typeof PayloadPercentileSchema>;
export type IPayloadPercentileEmpty = Extract<
	IPayloadPercentile,
	{ hasSamples: false }
>;
export type IPayloadPercentileSampled = Extract<
	IPayloadPercentile,
	{ hasSamples: true }
>;

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

/**
 * The read side every `*_metrics` tool needs: take a snapshot, and
 * optionally zero the sample window in the same call.
 *
 * Generic over the snapshot so each plugin keeps its own shape — only
 * the read-then-maybe-reset sequence is shared, which is exactly the
 * part both plugins had copied verbatim.
 */
export interface IResettableMetricsRegistry<TSnapshot> {
	snapshot(): TSnapshot;
	reset(): void;
}
