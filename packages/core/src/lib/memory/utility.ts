/**
 * utility.ts — f00197 (Track M, P2) memory utility score.
 *
 * Pure scoring function the memory retrieval layer uses to decide
 * WHICH memories to inject into the LLM context. Each entry is
 * scored against the current request and entries whose score is
 * below `costThreshold` are filtered out — the goal is to keep the
 * LLM's context lean and on-topic.
 *
 * Formula (every component normalised to `[0, 1]`):
 *
 *     utility = recency    * α
 *             + similarity * β
 *             + usage      * γ
 *             - costBytes  * δ
 *
 *   - `recency`     : 1.0 for `now`, decays linearly to 0 at
 *                     `recencyHalfLifeMs`. Decay = `0.5^(age / halfLife)`.
 *   - `similarity`  : optional cosine / BM25 similarity already
 *                     computed by the retriever (default 0 when no
 *                     similarity is available — the entry is still
 *                     scored on its other components).
 *   - `usage`       : `tanh(usageCount / usageHalfCount)` so a
 *                     heavily-used memory plateaus near 1 instead
 *                     of growing without bound.
 *   - `costBytes`   : `sizeBytes / maxSizeBytes`, normalised
 *                     against the request's max so a single huge
 *                     memory does not crush the score.
 *
 * No I/O, no clock, no globals. Callers pass in `now` (ms) and the
 * normalisation maxima explicitly so the function stays
 * deterministic and easy to test.
 *
 * Privacy (R1.1–R1.10): this file receives only the fields the
 * selector needs (`id`, `createdAt`, `lastUsedAt`, `usageCount`,
 * `sizeBytes`, `similarity`). It NEVER reads `title` / `body` /
 * `tags` and so cannot leak memory content into logs. Tests below
 * verify the surface explicitly.
 */
export interface IMemoryUtilityWeights {
	/** Weight of the recency component. */
	readonly alpha: number;
	/** Weight of the similarity component. */
	readonly beta: number;
	/** Weight of the usage-frequency component. */
	readonly gamma: number;
	/** Weight of the (penalising) cost-in-bytes component. */
	readonly delta: number;
}

/**
 * A memory entry as the selector sees it. `title` / `body` / `tags`
 * are deliberately NOT here: the selector scores on metadata only
 * so it never reads the contents (R1.1–R1.10). The retriever can
 * fetch the full body once the selector has decided to keep it.
 */
export interface IMemoryEntry {
	/** Stable id (only ever used for debug logs / telemetry). */
	readonly id: string;
	/** Creation timestamp, ms since epoch. */
	readonly createdAt: number;
	/** Last successful retrieval timestamp, ms since epoch. */
	readonly lastUsedAt: number;
	/** How many times the entry has been retrieved. */
	readonly usageCount: number;
	/** Payload size in bytes (title + body + tags + envelope). */
	readonly sizeBytes: number;
	/**
	 * Optional similarity score (0..1) already computed by the
	 * retriever for the current query. Defaults to 0 when absent
	 * so the selector still scores the entry on recency / usage.
	 */
	readonly similarity?: number;
}

/**
 * Per-batch context. `maxSizeBytes` is the biggest entry in the
 * current batch (or `0` if the batch is empty / unknown) so the
 * cost component is comparable across batches.
 */
export interface IMemoryUtilityContext {
	/** Reference "now" in ms since epoch. */
	readonly now: number;
	/** Largest `sizeBytes` in the batch (used to normalise cost). */
	readonly maxSizeBytes: number;
	/** Half-life for the recency decay. */
	readonly recencyHalfLifeMs: number;
	/** Usage count at which `usage` saturates near 1. */
	readonly usageHalfCount: number;
}

/**
 * Retrieval-time tuning. Mirrors the config shape callers can build
 * from `plugins.memory.options.utility` while staying optional so the
 * legacy top-level retrieval options remain valid.
 */
export interface IMemoryUtilitySettings {
	readonly weights?: IMemoryUtilityWeights;
	readonly costThreshold?: number;
	readonly recencyHalfLifeMs?: number;
	readonly usageHalfCount?: number;
}

/** A scored entry, with the components broken out for transparency. */
export interface IMemoryUtilityScore {
	readonly entry: IMemoryEntry;
	readonly components: {
		readonly recency: number;
		readonly similarity: number;
		readonly usage: number;
		readonly costBytes: number;
	};
	readonly score: number;
}

/**
 * Conservative defaults. Bias toward similarity (β = 0.5) and
 * recency (α = 0.25), give usage a small bump (γ = 0.15), and
 * keep the cost penalty tiny (δ = 0.1). Hosts that want
 * freshness-first can lower β and raise α.
 */
export const DEFAULT_MEMORY_UTILITY_WEIGHTS: IMemoryUtilityWeights = {
	alpha: 0.25,
	beta: 0.5,
	gamma: 0.15,
	delta: 0.1,
};

export const DEFAULT_MEMORY_RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1_000;

export const DEFAULT_MEMORY_USAGE_HALF_COUNT = 5;

/** Conservative threshold below which a memory is dropped. */
export const DEFAULT_MEMORY_COST_THRESHOLD = 0.15;

export const resolveMemoryUtilitySettings = (
	settings?: IMemoryUtilitySettings,
): {
	readonly weights: IMemoryUtilityWeights;
	readonly costThreshold: number;
	readonly recencyHalfLifeMs: number;
	readonly usageHalfCount: number;
} => ({
	weights: {
		alpha: finiteOr(
			settings?.weights?.alpha,
			DEFAULT_MEMORY_UTILITY_WEIGHTS.alpha,
		),
		beta: finiteOr(
			settings?.weights?.beta,
			DEFAULT_MEMORY_UTILITY_WEIGHTS.beta,
		),
		gamma: finiteOr(
			settings?.weights?.gamma,
			DEFAULT_MEMORY_UTILITY_WEIGHTS.gamma,
		),
		delta: finiteOr(
			settings?.weights?.delta,
			DEFAULT_MEMORY_UTILITY_WEIGHTS.delta,
		),
	},
	costThreshold: finiteOr(
		settings?.costThreshold,
		DEFAULT_MEMORY_COST_THRESHOLD,
	),
	recencyHalfLifeMs: Math.max(
		1,
		finiteOr(
			settings?.recencyHalfLifeMs,
			DEFAULT_MEMORY_RECENCY_HALF_LIFE_MS,
		),
	),
	usageHalfCount: Math.max(
		1,
		finiteOr(settings?.usageHalfCount, DEFAULT_MEMORY_USAGE_HALF_COUNT),
	),
});

export const createMemoryUtilityContext = (
	entries: readonly Pick<IMemoryEntry, 'sizeBytes'>[],
	now: number,
	settings?: Pick<
		IMemoryUtilitySettings,
		'recencyHalfLifeMs' | 'usageHalfCount'
	>,
): IMemoryUtilityContext => {
	const resolved = resolveMemoryUtilitySettings(settings);
	return {
		now,
		maxSizeBytes: entries.reduce(
			(max, entry) => Math.max(max, finiteOr(entry.sizeBytes, 0)),
			0,
		),
		recencyHalfLifeMs: resolved.recencyHalfLifeMs,
		usageHalfCount: resolved.usageHalfCount,
	};
};

/**
 * Compute the utility of one entry. Pure: same inputs → same
 * output, no hidden state. Non-finite weights are clamped to 0 so
 * a malformed config cannot poison the score.
 */
export const utility = (
	entry: IMemoryEntry,
	weights: IMemoryUtilityWeights,
	context: IMemoryUtilityContext,
): IMemoryUtilityScore => {
	const recency = computeRecency(entry, context);
	const similarity = clamp01(entry.similarity ?? 0);
	const usage = computeUsage(entry, context);
	const costBytes = computeCostBytes(entry, context);

	const alpha = Number.isFinite(weights.alpha) ? weights.alpha : 0;
	const beta = Number.isFinite(weights.beta) ? weights.beta : 0;
	const gamma = Number.isFinite(weights.gamma) ? weights.gamma : 0;
	const delta = Number.isFinite(weights.delta) ? weights.delta : 0;

	const score =
		alpha * recency + beta * similarity + gamma * usage - delta * costBytes;

	return {
		entry,
		components: { recency, similarity, usage, costBytes },
		score,
	};
};

/**
 * Filter a list of entries by utility: only entries with
 * `score > costThreshold` are returned, best-first. Stable:
 * ties keep insertion order.
 */
export const filterByUtility = (
	entries: readonly IMemoryEntry[],
	weights: IMemoryUtilityWeights,
	context: IMemoryUtilityContext,
	costThreshold: number = DEFAULT_MEMORY_COST_THRESHOLD,
): readonly IMemoryUtilityScore[] => {
	const scored = entries.map((e) => utility(e, weights, context));
	const threshold = finiteOr(costThreshold, DEFAULT_MEMORY_COST_THRESHOLD);
	return scored
		.filter((s) => s.score > threshold)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (b.components.similarity !== a.components.similarity) {
				return b.components.similarity - a.components.similarity;
			}
			if (b.components.recency !== a.components.recency) {
				return b.components.recency - a.components.recency;
			}
			if (b.components.usage !== a.components.usage) {
				return b.components.usage - a.components.usage;
			}
			if (a.components.costBytes !== b.components.costBytes) {
				return a.components.costBytes - b.components.costBytes;
			}
			return 0;
		});
};

// --- helpers -----------------------------------------------------------------

const finiteOr = (value: number | undefined, fallback: number): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp01 = (n: number): number => {
	if (!Number.isFinite(n)) return 0;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
};

const computeRecency = (
	entry: IMemoryEntry,
	context: IMemoryUtilityContext,
): number => {
	const halfLife = Math.max(1, context.recencyHalfLifeMs);
	const age = Math.max(0, context.now - entry.lastUsedAt);
	// Exponential decay: 1.0 at age=0, 0.5 at age=halfLife, etc.
	// Math.pow(0.5, age/halfLife) but we keep it readable.
	const decay = 0.5 ** (age / halfLife);
	return clamp01(decay);
};

const computeUsage = (
	entry: IMemoryEntry,
	context: IMemoryUtilityContext,
): number => {
	const half = Math.max(1, context.usageHalfCount);
	const count = Number.isFinite(entry.usageCount)
		? Math.max(0, entry.usageCount)
		: 0;
	return clamp01(Math.tanh(count / half));
};

const computeCostBytes = (
	entry: IMemoryEntry,
	context: IMemoryUtilityContext,
): number => {
	if (context.maxSizeBytes <= 0) return 0;
	const size = Number.isFinite(entry.sizeBytes)
		? Math.max(0, entry.sizeBytes)
		: 0;
	return clamp01(size / context.maxSizeBytes);
};
