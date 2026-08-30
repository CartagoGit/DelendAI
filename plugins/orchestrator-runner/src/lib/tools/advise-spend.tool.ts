/**
 * advise-spend.tool.ts — `<prefix>_advise_spend` (f00067 S7).
 *
 * The LLM-as-cost-analyst surface. It reads the `usage-tracking` plugin's
 * rollup (`usage-summary.json`, written by that plugin's circuit breaker and
 * 5-min tick), projects the current spend state — including the S7
 * `limitsStatus` so the analyst can warn BEFORE the wall — and returns
 * NON-DESTRUCTIVE observations + recommendations, each tagged with a
 * `riskLevel`. It NEVER edits config: the user confirms any change.
 *
 * Cross-plugin coupling is via the shared cache FILE only (no import of the
 * usage-tracking package): the runner derives the sibling summary path from
 * the core cache dir. `buildSpendAdvice` is a pure function so the analysis
 * (observations + risk levels) is unit-tested without a summary on disk.
 */
import { readFile } from 'node:fs/promises';

import {
	compactOutputSchema,
	projectDetail,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import z from 'zod';

import {
	SPEND_DETAIL_PROJECTIONS,
	type ISpendFullView,
} from '../contracts/spend-view.contract';

/** A grouped usage bucket, mirrored from usage-tracking's `IRollupBucket`. */
export interface IUsageBucket {
	readonly key: string;
	readonly calls: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly errors: number;
	readonly autoBypassed: number;
}

/** The breaker verdict block, mirrored from usage-tracking's `ILimitsStatus`. */
export interface ILimitsStatusView {
	readonly sessionSpendUsd: number;
	readonly sessionLimitUsd: number | null;
	readonly sessionLimitPct: number | null;
	readonly monthlySpendUsd: number;
	readonly monthlyLimitUsd: number | null;
	readonly monthlyLimitPct: number | null;
	readonly breached: 'session' | 'monthly' | null;
}

export interface ISpendCurrentState {
	readonly byProvider: readonly IUsageBucket[];
	readonly byPlugin: readonly IUsageBucket[];
	readonly byAgent: readonly IUsageBucket[];
	readonly byExtension: readonly IUsageBucket[];
	readonly limitsStatus: ILimitsStatusView;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface IRecommendation {
	readonly title: string;
	readonly detail: string;
	readonly riskLevel: RiskLevel;
}

export interface ISpendAdvice {
	readonly observations: readonly string[];
	readonly recommendations: readonly IRecommendation[];
}

const emptyLimits = (): ILimitsStatusView => ({
	sessionSpendUsd: 0,
	sessionLimitUsd: null,
	sessionLimitPct: null,
	monthlySpendUsd: 0,
	monthlyLimitUsd: null,
	monthlyLimitPct: null,
	breached: null,
});

export const emptyCurrentState = (): ISpendCurrentState => ({
	byProvider: [],
	byPlugin: [],
	byAgent: [],
	byExtension: [],
	limitsStatus: emptyLimits(),
});

const usd = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Derive observations + risk-graded recommendations from the current state.
 * PURE and NON-DESTRUCTIVE: it only describes and suggests — never mutates
 * config or the roster. The caller (a human, via the LLM) confirms any change.
 */
export const buildSpendAdvice = (state: ISpendCurrentState): ISpendAdvice => {
	const observations: string[] = [];
	const recommendations: IRecommendation[] = [];
	const limits = state.limitsStatus;

	const totalCost = state.byProvider.reduce((a, b) => a + b.costUsd, 0);
	const totalBypassed = state.byProvider.reduce(
		(a, b) => a + b.autoBypassed,
		0,
	);

	// ── Session cap ─────────────────────────────────────────────────────────
	if (limits.sessionLimitUsd !== null) {
		const pct = limits.sessionLimitPct ?? 0;
		observations.push(
			`Session spend ${usd(limits.sessionSpendUsd)} of ${usd(limits.sessionLimitUsd)} cap (${pct}%).`,
		);
		if (limits.breached === 'session') {
			recommendations.push({
				title: 'Session spend cap reached',
				detail: `You have hit your ${usd(limits.sessionLimitUsd)} session cap. The orchestrator will refuse new api/cli spend (or degrade to a costTier<=1 provider under rerank). Switch to a subscription or cheaper model to continue.`,
				riskLevel: 'high',
			});
		} else if (pct >= 80) {
			recommendations.push({
				title: 'Approaching session cap',
				detail: `You have ${usd(Math.max(0, limits.sessionLimitUsd - limits.sessionSpendUsd))} of your session cap left. Consider a cheaper model for the rest of the session.`,
				riskLevel: 'medium',
			});
		}
	}

	// ── Monthly cap ─────────────────────────────────────────────────────────
	if (limits.monthlyLimitUsd !== null) {
		const pct = limits.monthlyLimitPct ?? 0;
		observations.push(
			`Monthly spend ${usd(limits.monthlySpendUsd)} of ${usd(limits.monthlyLimitUsd)} cap (${pct}%).`,
		);
		if (limits.breached === 'monthly') {
			recommendations.push({
				title: 'Monthly spend cap reached',
				detail: `You have hit your ${usd(limits.monthlyLimitUsd)} monthly cap. Reduce reliance on paid providers until the calendar month resets.`,
				riskLevel: 'high',
			});
		} else if (pct >= 80) {
			recommendations.push({
				title: 'Approaching monthly cap',
				detail: `You have ${usd(Math.max(0, limits.monthlyLimitUsd - limits.monthlySpendUsd))} of your monthly cap left; consider switching to a cheaper tier for the rest of the week.`,
				riskLevel: 'medium',
			});
		}
	}

	// ── Cost concentration ──────────────────────────────────────────────────
	const top = state.byProvider[0];
	if (top !== undefined && totalCost > 0 && top.costUsd / totalCost >= 0.6) {
		recommendations.push({
			title: `"${top.key}" dominates spend`,
			detail: `${top.key} accounts for ${usd(top.costUsd)} of ${usd(totalCost)} total. If a cheaper provider covers the same capabilities, routing more traffic there would cut cost.`,
			riskLevel: 'low',
		});
	}

	// ── Auto-bypass posture ─────────────────────────────────────────────────
	if (totalBypassed > 0) {
		observations.push(
			`${totalBypassed} invocation(s) auto-bypassed the spend-confirmation prompt.`,
		);
		recommendations.push({
			title: 'Auto-bypass is active',
			detail: `${totalBypassed} spend(s) skipped confirmation (confirmBeforeExecute:false). If this was not intended, re-enable confirmation to require a signed token per invocation.`,
			riskLevel: 'medium',
		});
	}

	if (observations.length === 0) {
		observations.push(
			'No spend caps configured and no spend recorded yet.',
		);
	}

	return { observations, recommendations };
};

const num = (v: unknown): number =>
	typeof v === 'number' && Number.isFinite(v) ? v : 0;
const numOrNull = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown): string => (typeof v === 'string' ? v : 'unknown');

const asRecord = (v: unknown): Record<string, unknown> | null =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

const bucketOf = (v: unknown): IUsageBucket => {
	const r = asRecord(v) ?? {};
	return {
		key: str(r.key),
		calls: num(r.calls),
		inputTokens: num(r.inputTokens),
		outputTokens: num(r.outputTokens),
		totalTokens: num(r.totalTokens),
		costUsd: num(r.costUsd),
		errors: num(r.errors),
		autoBypassed: num(r.autoBypassed),
	};
};

const bucketsOf = (v: unknown): IUsageBucket[] =>
	Array.isArray(v) ? v.map(bucketOf) : [];

const limitsOf = (v: unknown): ILimitsStatusView => {
	const r = asRecord(v);
	if (!r) return emptyLimits();
	const breached =
		r.breached === 'session' || r.breached === 'monthly'
			? r.breached
			: null;
	return {
		sessionSpendUsd: num(r.sessionSpendUsd),
		sessionLimitUsd: numOrNull(r.sessionLimitUsd),
		sessionLimitPct: numOrNull(r.sessionLimitPct),
		monthlySpendUsd: num(r.monthlySpendUsd),
		monthlyLimitUsd: numOrNull(r.monthlyLimitUsd),
		monthlyLimitPct: numOrNull(r.monthlyLimitPct),
		breached,
	};
};

/** Read + normalise `usage-summary.json` into the analyst's current state. */
export const readSpendState = async (
	summaryPath: string,
): Promise<{ state: ISpendCurrentState; windowDays: number }> => {
	try {
		const raw = await readFile(summaryPath, 'utf8');
		const doc = asRecord(JSON.parse(raw)) ?? {};
		return {
			state: {
				byProvider: bucketsOf(doc.byProvider),
				byPlugin: bucketsOf(doc.byPlugin),
				byAgent: bucketsOf(doc.byAgent),
				byExtension: bucketsOf(doc.byExtension),
				limitsStatus: limitsOf(doc.limitsStatus),
			},
			windowDays: num(doc.windowDays),
		};
	} catch {
		return { state: emptyCurrentState(), windowDays: 0 };
	}
};

export interface IAdviseSpendToolOptions {
	readonly namespacePrefix: string;
	/** Sibling `usage-tracking` summary file (derived from the core cache dir). */
	readonly usageSummaryPath: string;
}

const InputSchema = z.object({
	windowDays: z.number().positive().optional(),
	// r00032: opt-in projection level (compact | normal | full).
	detail: z.enum(['compact', 'normal', 'full']).optional(),
});

export const buildAdviseSpendRegistration = (
	options: IAdviseSpendToolOptions,
): IToolRegistration => ({
	id: 'advise_spend',
	tags: ['orchestrator-runner', 'lazy', 'spend', 'analyst'],
	summary:
		'Analyse recorded spend + limit status and recommend non-destructive cost actions (risk-graded).',
	descriptionKey: 'mcp-vertex_orchestrator-runner_advise_spend',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_advise_spend`,
			{
				description:
					"Act as a cost analyst over recorded usage. Reads the usage-tracking rollup (spend by provider, plugin, agent, extension) plus the circuit-breaker limitsStatus (rolling session + monthly spend vs your caps) and returns observations plus risk-graded (low/medium/high) recommendations — e.g. 'you have $12 of your $50 monthly cap left; consider switching to a cheaper model.' Recommendations are NON-DESTRUCTIVE: it never edits your config or roster; you confirm any change yourself.",
				inputSchema: InputSchema,
				// v00130 (AUD-B01): `AdviseSpendOutputSchema` is not used as
				// a runtime response validator anywhere in this handler —
				// only declared here as the wire `outputSchema`. It stays
				// exported from `schemas.ts` for the behavioural tests;
				// `tools/list` gets the compact envelope instead. The real
				// response payload is unchanged.
				outputSchema: compactOutputSchema(),
			},
			async (args: z.infer<typeof InputSchema>) => {
				const { state, windowDays } = await readSpendState(
					options.usageSummaryPath,
				);
				const advice = buildSpendAdvice(state);
				const observations = [...advice.observations];
				if (
					args.windowDays !== undefined &&
					args.windowDays !== windowDays
				) {
					observations.push(
						`Requested windowDays=${args.windowDays}; the usage rollup is currently aggregated over ${windowDays} day(s). Adjust plugins.usage-tracking.options.windowDays to change the rollup window.`,
					);
				}
				const full: ISpendFullView = {
					windowDays: args.windowDays ?? windowDays,
					generatedAt: new Date().toISOString(),
					currentState: state,
					observations,
					recommendations: advice.recommendations,
				};
				// r00032: project the view according to `args.detail`
				// (default `'normal'` per the transversal contract).
				const level = args.detail ?? 'normal';
				const view = projectDetail(
					full,
					SPEND_DETAIL_PROJECTIONS,
					level,
				);
				return toolJson({
					view,
					level,
				});
			},
		);
	},
});
