/**
 * latency-tax.ts — r00025 S2: latency signal for plugin selection.
 *
 * Pure: no I/O, no clock, no random. The selector passes in the
 * local `usage-tracking` aggregate (per-plugin p95 latency in ms).
 * When the host has no observation — cold start, freshly checked-
 * out plugin, or `usage-tracking` disabled — we return the neutral
 * `0.5` so the selector neither rewards nor penalises the candidate
 * for what it has not been able to measure yet.
 *
 * Scoring semantics:
 *  - Missing `p95LatencyMs` or `observedCalls === 0`: neutral `0.5`.
 *  - Otherwise: cheap (1) when p95 is well below
 *    `LATENCY_REFERENCE_MS` (1 second), and approaches 0 as p95
 *    climbs above the reference.
 *
 * No telemetry is ever sent or read over the network. The aggregate
 * is fed in by the host from `${cacheDir}/usage-tracking/usage-summary.json`.
 */
const LATENCY_REFERENCE_MS = 1_000;

/** Inputs accepted by `scoreLatencyTax`. */
export interface ILatencyTaxInput {
	/** p95 latency in milliseconds observed locally for this candidate. */
	readonly p95LatencyMs?: number | null | undefined;
	/** How many invocations contributed to the aggregate. */
	readonly observedCalls?: number | undefined;
}

/**
 * Score the latency-tax signal for one candidate. Range `0..1`:
 * `1` means fast, `0` means slow beyond the reference, and `0.5`
 * means "no observation available — do not penalise".
 */
export const scoreLatencyTax = (input: ILatencyTaxInput): number => {
	const p95 = input.p95LatencyMs;
	const observed = input.observedCalls ?? 0;
	if (p95 === null || p95 === undefined) return 0.5;
	if (!Number.isFinite(p95) || p95 < 0) return 0.5;
	if (observed <= 0) return 0.5;
	const ratio = p95 / LATENCY_REFERENCE_MS;
	if (ratio <= 0) return 1;
	// Linear interpolation: `ratio = 0` (instant) → `1` (very cheap),
	// `ratio = 1` (p95 equals the reference) → `0.5` (borderline), and
	// `ratio >= 2` → `0`. Anything above the reference is treated as
	// twice the cost, capping the curve at 0.
	const score = 1 - ratio / 2;
	return Math.max(0, Math.min(1, score));
};
