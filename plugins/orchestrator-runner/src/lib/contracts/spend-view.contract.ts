/**
 * `spend_view` projections — `r00032`.
 *
 * Three projection levels (compact | normal | full) for the
 * `advise_spend` tool. Same pattern as `r00031` / `f00187`.
 *
 * `compact`:        session spend vs cap, monthly spend vs cap, top 1
 *                   recommendation, no per-bucket breakdowns.
 * `normal`:         + observations + all recommendations + breach status.
 * `full` (default): + byProvider / byPlugin / byAgent / byExtension buckets.
 */

import type { DetailProjections } from '@mcp-vertex/core/public';

import type {
	IRecommendation,
	ISpendCurrentState,
} from '../tools/advise-spend.tool';

export interface ISpendCompactView {
	readonly windowDays: number;
	readonly generatedAt: string;
	readonly sessionSpendUsd: number;
	readonly sessionLimitUsd: number | null;
	readonly monthlySpendUsd: number;
	readonly monthlyLimitUsd: number | null;
	readonly breached: 'session' | 'monthly' | null;
	readonly topRecommendation: IRecommendation | null;
}

export interface ISpendNormalView extends ISpendCompactView {
	readonly observations: readonly string[];
	readonly recommendations: readonly IRecommendation[];
	readonly topByPlugin: readonly {
		readonly key: string;
		readonly totalTokens: number;
		readonly costUsd: number;
	}[];
}

export interface ISpendFullView {
	readonly windowDays: number;
	readonly generatedAt: string;
	readonly currentState: ISpendCurrentState;
	readonly observations: readonly string[];
	readonly recommendations: readonly IRecommendation[];
}

const topBucket = (
	buckets: readonly { key: string; totalTokens: number; costUsd: number }[],
	limit = 3,
): readonly { key: string; totalTokens: number; costUsd: number }[] =>
	[...buckets]
		.sort((a, b) => b.totalTokens - a.totalTokens)
		.slice(0, limit)
		.map((b) => ({
			key: b.key,
			totalTokens: b.totalTokens,
			costUsd: b.costUsd,
		}));

export const projectSpendCompact = (
	full: ISpendFullView,
): ISpendCompactView => {
	const { limitsStatus } = full.currentState;
	return {
		windowDays: full.windowDays,
		generatedAt: full.generatedAt,
		sessionSpendUsd: limitsStatus.sessionSpendUsd,
		sessionLimitUsd: limitsStatus.sessionLimitUsd,
		monthlySpendUsd: limitsStatus.monthlySpendUsd,
		monthlyLimitUsd: limitsStatus.monthlyLimitUsd,
		breached: limitsStatus.breached,
		topRecommendation: full.recommendations[0] ?? null,
	};
};

export const projectSpendNormal = (full: ISpendFullView): ISpendNormalView => {
	const compact = projectSpendCompact(full);
	return {
		...compact,
		observations: full.observations,
		recommendations: full.recommendations,
		topByPlugin: topBucket(full.currentState.byPlugin),
	};
};

export const projectSpendFull = (full: ISpendFullView): ISpendFullView => full;

export const SPEND_DETAIL_PROJECTIONS: DetailProjections<ISpendFullView> = {
	compact: (full) => projectSpendCompact(full),
	normal: (full) => projectSpendNormal(full),
	full: (full) => projectSpendFull(full),
};
