import { scorePermissionRiskForManifest } from './permission-risk.ts';

import type {
	IRecommendPluginsWeights,
	IUsageAggregation,
} from '../contracts/interfaces/plugin-fit.interface';
import type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
} from '../contracts/interfaces/plugin-fit.interface';
import { scoreHistoricalSuccess } from './historical-success';
import { scoreLatencyTax } from './latency-tax';
import { scoreTokenTax } from './token-tax';

/**
 * Fully-resolved weights: every key is a concrete `number`. We keep
 * this distinct from `Required<IRecommendPluginsWeights>` because
 * `exactOptionalPropertyTypes` does not let `Required<T>` strip the
 * explicit `| undefined` from optional-with-undefined keys, so we
 * define the resolved shape directly to make downstream math clean.
 */
type ResolvedWeights = {
	readonly match: number;
	readonly tokenTax: number;
	readonly latencyTax: number;
	readonly historicalSuccess: number;
	readonly permissionRisk: number;
};

export type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
	IRecommendPluginsWeights,
	IUsageAggregation,
} from '../contracts/interfaces/plugin-fit.interface';

const PACK_BONUS = 1;
const LANGUAGE_BONUS = 0.5;
const SHAPE_BONUS = 0.5;
const UNMATCHED_PENALTY = -0.05;
const MAX_PERMISSION_RISK = 5;

/**
 * r00025 S4 — defaults required by the proposal. They sum to `1.0`
 * so the scorer remains calibrated when the host does not provide a
 * custom weights block.
 */
const DEFAULT_WEIGHTS: ResolvedWeights = {
	match: 0.2,
	tokenTax: 0.25,
	latencyTax: 0.15,
	historicalSuccess: 0.2,
	permissionRisk: 0.2,
};

const SHAPE_MAP: Readonly<
	Record<
		keyof Pick<
			IProjectSignals,
			'hasDocsSite' | 'isCliTool' | 'hasBackend' | 'hasTests'
		>,
		string
	>
> = {
	hasDocsSite: 'docs-site',
	isCliTool: 'cli',
	hasBackend: 'backend',
	hasTests: 'tests',
};

/** Resolve the effective weights by overlaying the host's overrides. */
const resolveWeights = (
	override: IRecommendPluginsWeights | undefined,
): ResolvedWeights => ({
	match: override?.match ?? DEFAULT_WEIGHTS.match,
	tokenTax: override?.tokenTax ?? DEFAULT_WEIGHTS.tokenTax,
	latencyTax: override?.latencyTax ?? DEFAULT_WEIGHTS.latencyTax,
	historicalSuccess:
		override?.historicalSuccess ?? DEFAULT_WEIGHTS.historicalSuccess,
	permissionRisk: override?.permissionRisk ?? DEFAULT_WEIGHTS.permissionRisk,
});

/** Look up the usage aggregate for a candidate id (or empty on miss). */
const lookupUsage = (
	aggregations: ReadonlyMap<string, IUsageAggregation> | undefined,
	id: string,
): IUsageAggregation => aggregations?.get(id) ?? {};

const scoreOne = (
	signals: IProjectSignals,
	candidate: IPluginCandidate,
	weights: ResolvedWeights,
	usage: IUsageAggregation,
): { utility: number; reasons: string[]; unmatched: string[] } => {
	const reasons = new Set<string>();
	const matchedTags = new Set<string>();
	let matchRaw = 0;

	// Pack bonus
	if (candidate.tags.includes(signals.pack)) {
		matchRaw += PACK_BONUS;
		reasons.add(`pack:${signals.pack}`);
		matchedTags.add(signals.pack);
	}

	// Language bonus
	const langSet = new Set(signals.languages);
	for (const tag of candidate.tags) {
		if (langSet.has(tag)) {
			matchRaw += LANGUAGE_BONUS;
			reasons.add(`language:${tag}`);
			matchedTags.add(tag);
		}
	}

	// Project-shape bonus
	for (const [field, tag] of Object.entries(SHAPE_MAP)) {
		if (signals[field as keyof typeof SHAPE_MAP] === true) {
			if (candidate.tags.includes(tag)) {
				matchRaw += SHAPE_BONUS;
				reasons.add(`${field}:${tag}`);
				matchedTags.add(tag);
			}
		}
	}

	// Unmatched penalty
	const unmatched: string[] = [];
	for (const tag of candidate.tags) {
		if (!matchedTags.has(tag)) {
			matchRaw += UNMATCHED_PENALTY;
			unmatched.push(tag);
		}
	}

	// f00180 S3 / MAN-004: per-tool permission map. The new helper
	// unifies the legacy global `permissions` array and the new
	// `toolPermissions` map into a single risk score; the manifest
	// without per-tool data falls back to the global set, identical
	// to the pre-f00180 behaviour.
	const permissionRisk = scorePermissionRiskForManifest(candidate);
	const normalizedPermissionRisk = permissionRisk / MAX_PERMISSION_RISK;
	if (permissionRisk > 0) {
		reasons.add(`permission-risk:${permissionRisk}`);
	}

	// r00025 S1 — token-tax signal. When the candidate did not
	// declare a budget (cold start for this plugin) we record the
	// neutral value in `reasons` for transparency but contribute 0
	// to the utility, so an unknown cost never demotes a match.
	const hasTokenBudget =
		candidate.tokenBudget !== undefined && candidate.tokenBudget !== null;
	const tokenTaxScore = scoreTokenTax({ tokenBudget: candidate.tokenBudget });
	const tokenTaxPenalty = hasTokenBudget
		? (1 - tokenTaxScore) * weights.tokenTax
		: 0;
	reasons.add(`token-tax:${tokenTaxScore.toFixed(2)}`);

	// r00025 S2 — latency-tax signal. Same cold-start rule: skip the
	// contribution when usage-tracking has no observation yet.
	const hasLatencyObservation =
		usage.p95LatencyMs !== null &&
		usage.p95LatencyMs !== undefined &&
		Number.isFinite(usage.p95LatencyMs) &&
		(usage.observedCalls ?? 0) > 0;
	const latencyTaxScore = scoreLatencyTax(usage);
	const latencyTaxPenalty = hasLatencyObservation
		? (1 - latencyTaxScore) * weights.latencyTax
		: 0;
	reasons.add(`latency-tax:${latencyTaxScore.toFixed(2)}`);

	// r00025 S3 — historical-success signal. Same cold-start rule.
	const hasSuccessObservation =
		usage.successRate !== null &&
		usage.successRate !== undefined &&
		Number.isFinite(usage.successRate) &&
		(usage.observedCalls ?? 0) > 0;
	const historicalScore = scoreHistoricalSuccess(usage);
	const historicalBonus = hasSuccessObservation
		? historicalScore * weights.historicalSuccess
		: 0;
	reasons.add(`historical-success:${historicalScore.toFixed(2)}`);

	const utility =
		matchRaw * weights.match -
		normalizedPermissionRisk * weights.permissionRisk -
		tokenTaxPenalty -
		latencyTaxPenalty +
		historicalBonus;

	return {
		utility,
		reasons: [...reasons].sort(),
		unmatched: unmatched.sort(),
	};
};

/**
 * Rank every candidate against the project signals. See the file
 * header for the scoring rules. Pure: no I/O, no clock, no random.
 */
export const recommendPlugins = (
	signals: IProjectSignals,
	candidates: readonly IPluginCandidate[],
	options: IRecommendPluginsOptions = {},
): readonly IPluginFit[] => {
	const limit = options.limit ?? candidates.length;
	const minScore = options.minScore ?? 0;
	const weights = resolveWeights(options.weights);
	const aggregations = options.usageAggregations;

	const scored = candidates.map((plugin) => {
		const usage = lookupUsage(aggregations, plugin.id);
		const { utility, reasons, unmatched } = scoreOne(
			signals,
			plugin,
			weights,
			usage,
		);
		return { plugin, utility, reasons, unmatched };
	});

	// Top utility drives normalization (top = 1.0). When every
	// candidate scored <= 0 the result is an empty array — there is
	// no positive top to normalize against.
	const topUtility = Math.max(0, ...scored.map((s) => s.utility));
	if (topUtility === 0) return [];

	const normalized: IPluginFit[] = scored
		.map(({ plugin, utility, reasons, unmatched }) => ({
			plugin,
			fitScore: utility <= 0 ? 0 : utility / topUtility,
			reasons,
			unmatchedTags: unmatched,
		}))
		.filter((fit) => fit.fitScore >= minScore)
		.sort((a, b) => {
			if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
			return a.plugin.id.localeCompare(b.plugin.id);
		})
		.slice(0, limit);

	return normalized;
};
