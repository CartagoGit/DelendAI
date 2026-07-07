/**
 * usage-cost.builder.ts — f00098 S2.
 *
 * Pure payload→render-model mapper for the usage cost-analyst card. Maps
 * the raw `usage_report` payload (usage-tracking plugin) plus the
 * `advise_spend` `limitsStatus` block (orchestrator-runner) into
 * `IUsageCostCardModel` with spend-vs-limit meters. No host API imports,
 * no I/O, never throws: when usage-tracking is absent it returns an
 * explicit 'plugin not loaded — opt-in' model with the exact config
 * snippet (f00098 non-goal: never an error state).
 *
 * The session and monthly meters stay INDEPENDENT — never averaged,
 * summed or combined — matching the circuit-breaker semantics (the
 * breaker trips on either cap alone).
 */
import type {
	ILimitsStatusPayload,
	ISpendMeter,
	IUsageCostCardModel,
	IUsageCostRow,
	IUsageReportPayload,
	IUsageTotalsPayload,
} from '../../contracts/interfaces/usage-cost.interface';

/** Exact opt-in snippet for the usage-tracking plugin. */
export const USAGE_TRACKING_OPT_IN_SNIPPET =
	'mcp-vertex --plugins=usage-tracking';

const num = (v: unknown): number =>
	typeof v === 'number' && Number.isFinite(v) ? v : 0;

const toTotals = (
	totals: IUsageTotalsPayload | undefined,
): IUsageTotalsPayload => ({
	calls: num(totals?.calls),
	inputTokens: num(totals?.inputTokens),
	outputTokens: num(totals?.outputTokens),
	totalTokens: num(totals?.totalTokens),
	costUsd: num(totals?.costUsd),
	errors: num(totals?.errors),
	autoBypassed: num(totals?.autoBypassed),
});

/**
 * Build the two spend meters from the breaker's `limitsStatus`. One meter
 * per scope; the scopes are never combined (circuit-breaker semantics).
 */
const toMeters = (
	limits: ILimitsStatusPayload | null | undefined,
): readonly [ISpendMeter, ISpendMeter] => [
	{
		scope: 'session',
		spendUsd: num(limits?.sessionSpendUsd),
		limitUsd: limits?.sessionLimitUsd ?? null,
		pct: limits?.sessionLimitPct ?? null,
		breached: limits?.breached === 'session',
	},
	{
		scope: 'monthly',
		spendUsd: num(limits?.monthlySpendUsd),
		limitUsd: limits?.monthlyLimitUsd ?? null,
		pct: limits?.monthlyLimitPct ?? null,
		breached: limits?.breached === 'monthly',
	},
];

/**
 * Build the cost-analyst card render-model from the raw tool payloads.
 *
 * @param report `usage_report` structured output, or `null`/`undefined`
 *   when usage-tracking is not loaded.
 * @param limitsStatus the `currentState.limitsStatus` block from
 *   `advise_spend`; optional — without it the meters render uncapped
 *   zeros and `limitsAvailable` is `false`.
 */
export function buildUsageCostModel(
	report: IUsageReportPayload | null | undefined,
	limitsStatus?: ILimitsStatusPayload | null,
): IUsageCostCardModel {
	if (report === null || report === undefined) {
		return {
			kind: 'plugin-absent',
			plugin: 'usage-tracking',
			hint: 'The usage-tracking plugin is not loaded. It is opt-in (not in any preset): start the server with it enabled to record and report usage/cost.',
			configSnippet: USAGE_TRACKING_OPT_IN_SNIPPET,
		};
	}

	const totals = toTotals(report.totals);
	const buckets = Array.isArray(report.buckets) ? report.buckets : [];
	const rows: IUsageCostRow[] = buckets.map((bucket) => ({
		key: bucket.key,
		calls: num(bucket.calls),
		totalTokens: num(bucket.totalTokens),
		costUsd: num(bucket.costUsd),
		errors: num(bucket.errors),
		autoBypassed: num(bucket.autoBypassed),
		costSharePct:
			totals.costUsd > 0
				? Math.round((num(bucket.costUsd) / totals.costUsd) * 100)
				: null,
	}));

	return {
		kind: 'ready',
		groupBy: report.groupBy ?? 'provider',
		windowDays: num(report.windowDays),
		totals,
		empty: totals.calls === 0 && rows.length === 0,
		rows,
		expensiveCalls: Array.isArray(report.expensiveCalls)
			? report.expensiveCalls
			: [],
		meters: toMeters(limitsStatus),
		breached: limitsStatus?.breached ?? null,
		limitsAvailable: limitsStatus !== null && limitsStatus !== undefined,
	};
}
