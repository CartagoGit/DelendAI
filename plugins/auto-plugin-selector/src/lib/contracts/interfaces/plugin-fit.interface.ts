/**
 * plugin-fit.interface.ts — f00142 S1/S2: the contracts for the
 * `auto-plugin-selector` plugin's pure scorer and its MCP tool.
 *
 * The scorer is signal-driven: every recommendation cites the
 * signals that matched. The tool wires the bundled
 * `FIRST_PARTY_PLUGIN_INDEX` as the default catalog.
 */

import type {
	IPluginTokenBudget,
	ITokenBudgetCeiling,
	PermissionCategory,
	ProjectPackKind,
} from '@delendai/core/public';

/** A plugin the scorer can recommend from the catalog. */
export interface IPluginCandidate {
	readonly id: string;
	readonly tags: readonly string[];
	readonly summary: string;
	readonly permissions?: readonly PermissionCategory[] | undefined;
	readonly origin?: 'first-party' | 'community' | undefined;
	/**
	 * Token budget for this candidate. r00025 S1: optional so a host
	 * can omit it (we then score neutral 0.5). Accepts every shape
	 * the manifest registry can produce:
	 *   - legacy `number` (raw token count),
	 *   - legacy `ITokenBudgetCeiling` (hard/warning/release),
	 *   - f00179 `IPluginTokenBudget` (real `staticBytes` + `caps`).
	 */
	readonly tokenBudget?:
		| number
		| ITokenBudgetCeiling
		| IPluginTokenBudget
		| undefined;
}

/** Project-shape signals that drive the scoring. */
export interface IProjectSignals {
	readonly pack: ProjectPackKind;
	readonly languages: readonly string[];
	readonly hasDocsSite?: boolean | undefined;
	readonly isCliTool?: boolean | undefined;
	readonly hasBackend?: boolean | undefined;
	readonly hasTests?: boolean | undefined;
	readonly taskHint?: string | undefined;
}

/**
 * Per-candidate local usage aggregate, fed in by the host from
 * `${cacheDir}/usage-tracking/usage-summary.json#byPlugin`. r00025
 * S2/S3 — empty when `usage-tracking` is disabled or has no data
 * for the candidate yet.
 */
export interface IUsageAggregation {
	readonly p95LatencyMs?: number | null | undefined;
	readonly successRate?: number | null | undefined;
	readonly observedCalls?: number | undefined;
}

/**
 * Weights for the r00025 scoring formula. Each weight controls how
 * much its signal contributes to the final `utility`. Defaults are
 * defined in `recommend-plugins.ts` (`DEFAULT_WEIGHTS`). The host
 * may override any subset.
 */
export interface IRecommendPluginsWeights {
	readonly match?: number | undefined;
	readonly tokenTax?: number | undefined;
	readonly latencyTax?: number | undefined;
	readonly historicalSuccess?: number | undefined;
	readonly permissionRisk?: number | undefined;
}

/** One ranked fit: a plugin + score + reasons + unmatched tags. */
export interface IPluginFit {
	readonly plugin: IPluginCandidate;
	/** Normalized 0..1 fit score; top plugin always 1.0. */
	readonly fitScore: number;
	/** Signal ids that contributed (sorted). */
	readonly reasons: readonly string[];
	/** Catalog tags that did NOT match anything in the signals. */
	readonly unmatchedTags: readonly string[];
}

/** Options that influence aggregation / filtering. */
export interface IRecommendPluginsOptions {
	/** Cap on returned fits (defaults to `candidates.length`). */
	readonly limit?: number | undefined;
	/** Drop fits below this normalized score (defaults to 0). */
	readonly minScore?: number | undefined;
	/** r00025 S4 — configurable weights for the scoring formula. */
	readonly weights?: IRecommendPluginsWeights | undefined;
	/**
	 * r00025 S2/S3 — per-candidate local usage aggregates keyed by
	 * `IPluginCandidate.id`. When the id is absent, both signals
	 * return the neutral 0.5 (cold-start).
	 */
	readonly usageAggregations?:
		| ReadonlyMap<string, IUsageAggregation>
		| undefined;
}
