/**
 * utility.ts — f00195 (Track L, P2) cost-aware routing utility.
 *
 * Pure scoring function the client router (`f00193` —
 * `packages/client/src/services/external-mcp/router.ts`) uses to rank
 * provider candidates by an explicit cost / quality trade-off:
 *
 *     utility = quality
 *             - tokenCost*λ
 *             - latency*μ
 *             - securityRisk*ν
 *
 * All inputs are normalised to `[0, 1]` so the weights are
 * directly comparable; the result is a higher-is-better scalar.
 *
 * No I/O, no clock, no globals — a pure function that any consumer
 * (router, batch ranker, evaluator) can call deterministically.
 *
 *   - `quality`     : pre-normalised score from the provider manifest
 *                     (0..1, higher = better). Comes from capability
 *                     versioning (`f00194`).
 *   - `tokenCost`   : observed or estimated cost per request. Divided
 *                     by `maxTokenCost` from the routing context to
 *                     land in `[0, 1]`.
 *   - `latencyMs`   : observed p50 latency. Divided by `maxLatencyMs`
 *                     from the routing context to land in `[0, 1]`.
 *   - `securityRisk`: pre-normalised (0..1) from the manifest; this
 *                     utility does NOT re-normalise it.
 *
 * Privacy: this file receives only numbers. No provider ids, tool
 * names or payloads flow through the utility, so it is safe to log
 * inputs / outputs without redaction (R1.1–R1.10 hold vacuously).
 */
export interface IUtilityWeights {
	/** Weight of the (normalised) token cost. Higher = penalises cost more. */
	readonly lambda: number;
	/** Weight of the (normalised) latency. Higher = penalises slowness more. */
	readonly mu: number;
	/** Weight of the security risk. Higher = penalises risky providers more. */
	readonly nu: number;
}

/**
 * A single routing candidate. `quality` and `securityRisk` are
 * pre-normalised in `[0, 1]`; `tokenCost` and `latencyMs` are raw
 * observed values normalised inside `utility()` against the context.
 */
export interface IProviderCandidate {
	readonly quality: number;
	readonly tokenCost: number;
	readonly latencyMs: number;
	readonly securityRisk: number;
}

/**
 * Per-batch context: the maxima the router observed across the
 * candidate set. They are used to normalise `tokenCost` /
 * `latencyMs` into `[0, 1]`. Passing `1` (or any positive number
 * for a single candidate) is safe — division by zero is guarded.
 */
export interface IRoutingContext {
	/** Max observed `tokenCost` across the candidates in this batch. */
	readonly maxTokenCost: number;
	/** Max observed `latencyMs` across the candidates in this batch. */
	readonly maxLatencyMs: number;
}

/** Result of one utility call. Higher = better candidate. */
export interface IUtilityScore {
	readonly candidate: IProviderCandidate;
	/** Components, post-normalisation, for transparency / debugging. */
	readonly components: {
		readonly quality: number;
		readonly tokenCost: number;
		readonly latency: number;
		readonly securityRisk: number;
	};
	/** Final scalar: `quality - λ·tokenCost - μ·latency - ν·securityRisk`. */
	readonly score: number;
}

/** A neutral starting point — equal trade-off between quality and cost. */
export const DEFAULT_UTILITY_WEIGHTS: IUtilityWeights = {
	lambda: 0.4,
	mu: 0.3,
	nu: 0.3,
};

/**
 * Clamp a value into `[lo, hi]`. Used defensively on the inputs so
 * a malformed manifest cannot push the score outside the expected
 * range.
 */
const clamp01 = (n: number, lo = 0, hi = 1): number => {
	if (!Number.isFinite(n)) return lo;
	if (n < lo) return lo;
	if (n > hi) return hi;
	return n;
};

/**
 * Normalise `value` by `max`. `max <= 0` (no observed reference,
 * single-candidate batches, all-zero set) collapses to `0` so the
 * candidate is not unfairly penalised — the caller can interpret
 * `0` as "we have no signal yet".
 */
const normaliseAgainst = (value: number, max: number): number => {
	if (!Number.isFinite(value) || value <= 0 || max <= 0) return 0;
	const ratio = value / max;
	return clamp01(ratio);
};

/**
 * Compute the utility of a single candidate against the routing
 * context. Pure: same inputs → same outputs, no hidden state.
 *
 * The score is the explicit linear form from the f00195 proposal.
 * Negative weights are accepted (they FLIP the trade-off), but
 * non-finite numbers are clamped / zeroed so the result is always
 * a real number.
 */
export const utility = (
	candidate: IProviderCandidate,
	weights: IUtilityWeights,
	context: IRoutingContext,
): IUtilityScore => {
	const normToken = normaliseAgainst(
		candidate.tokenCost,
		context.maxTokenCost,
	);
	const normLatency = normaliseAgainst(
		candidate.latencyMs,
		context.maxLatencyMs,
	);
	const quality = clamp01(candidate.quality);
	const securityRisk = clamp01(candidate.securityRisk);

	const lambda = Number.isFinite(weights.lambda) ? weights.lambda : 0;
	const mu = Number.isFinite(weights.mu) ? weights.mu : 0;
	const nu = Number.isFinite(weights.nu) ? weights.nu : 0;

	const score =
		quality - lambda * normToken - mu * normLatency - nu * securityRisk;

	return {
		candidate,
		components: {
			quality,
			tokenCost: normToken,
			latency: normLatency,
			securityRisk,
		},
		score,
	};
};

/**
 * Rank a batch of candidates, best-first. Stable: ties break by
 * `tokenCost` (cheaper wins), then by `latencyMs` (faster wins),
 * then by `securityRisk` (safer wins), then by alphabetic id-like
 * ordering — but since the input shape carries no id, the final
 * tie-break is the original insertion order (Array.prototype.sort
 * is stable in V8 / WebKit / SpiderMonkey). The router can rely on
 * deterministic output.
 */
export const rankCandidates = (
	candidates: readonly IProviderCandidate[],
	weights: IUtilityWeights,
	context: IRoutingContext,
): readonly IUtilityScore[] => {
	const scored = candidates.map((c) => utility(c, weights, context));
	return [...scored].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (a.candidate.tokenCost !== b.candidate.tokenCost) {
			return a.candidate.tokenCost - b.candidate.tokenCost;
		}
		if (a.candidate.latencyMs !== b.candidate.latencyMs) {
			return a.candidate.latencyMs - b.candidate.latencyMs;
		}
		return a.candidate.securityRisk - b.candidate.securityRisk;
	});
};
