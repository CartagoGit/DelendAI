/**
 * usage-cost.interface.ts — f00098 S2.
 *
 * Render-model contract for the usage cost-analyst card. The builder
 * (`../../dashboard/builders/usage-cost.builder`) maps the raw
 * `usage_report` payload (usage-tracking plugin) plus the `advise_spend`
 * `limitsStatus` block (orchestrator-runner plugin) into
 * `IUsageCostCardModel` with spend-vs-limit meters.
 *
 * Vocabulary note: this package does not depend on `@delendai/core` or
 * the plugins, so the minimal payload shapes below are re-declared 1:1
 * from the tool output schemas (`plugins/usage-tracking/src/lib/tools/
 * report.tool.ts` — `OutputSchema` — and `plugins/orchestrator-runner/
 * src/lib/schemas.ts` — `LimitsStatusSchema`). No re-invented fields.
 *
 * Circuit-breaker semantics: the session and monthly caps are INDEPENDENT
 * meters. They are never averaged, summed or otherwise combined — the
 * breaker trips on either one alone, so the card renders two separate
 * meters (see `ISpendMeter`).
 */

/** Grouping axes accepted by `usage_report`. */
export type UsageGroupByAxis = 'provider' | 'plugin' | 'agent' | 'extension';

/** Totals block of `usage_report` output. */
export interface IUsageTotalsPayload {
	readonly calls: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly errors: number;
	readonly autoBypassed: number;
}

/** One grouped bucket of `usage_report` output (`BucketSchema`). */
export interface IUsageBucketPayload extends IUsageTotalsPayload {
	readonly key: string;
}

/** One expensive call of `usage_report` output (`ExpensiveCallSchema`). */
export interface IUsageExpensiveCallPayload {
	readonly ts: string;
	readonly plugin: string;
	readonly tool: string;
	readonly agent: string;
	readonly provider: string | null;
	readonly costUsd: number | null;
	readonly durationMs: number | null;
	readonly outcome: string;
}

/** Raw `usage_report` payload (`OutputSchema` in report.tool.ts). */
export interface IUsageReportPayload {
	readonly groupBy: UsageGroupByAxis;
	readonly windowDays: number;
	readonly totals: IUsageTotalsPayload;
	readonly buckets: readonly IUsageBucketPayload[];
	readonly expensiveCalls: readonly IUsageExpensiveCallPayload[];
}

/**
 * The circuit-breaker verdict block from `advise_spend`
 * (`LimitsStatusSchema` / usage-tracking's `ILimitsStatus`).
 */
export interface ILimitsStatusPayload {
	readonly sessionSpendUsd: number;
	readonly sessionLimitUsd: number | null;
	readonly sessionLimitPct: number | null;
	readonly monthlySpendUsd: number;
	readonly monthlyLimitUsd: number | null;
	readonly monthlyLimitPct: number | null;
	readonly breached: 'session' | 'monthly' | null;
}

// ─── Render model ────────────────────────────────────────────────────────────

/**
 * One spend-vs-limit meter. Exactly one per cap scope; the two scopes are
 * never combined (circuit-breaker semantics — see file header).
 */
export interface ISpendMeter {
	readonly scope: 'session' | 'monthly';
	readonly spendUsd: number;
	readonly limitUsd: number | null;
	/** Percent of the cap spent, as reported by the breaker; `null` when uncapped. */
	readonly pct: number | null;
	readonly breached: boolean;
}

/** One grouped row of the card, with its share of total spend. */
export interface IUsageCostRow {
	readonly key: string;
	readonly calls: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly errors: number;
	readonly autoBypassed: number;
	/** Whole-percent share of `totals.costUsd`; `null` when total spend is 0. */
	readonly costSharePct: number | null;
}

/** Card model when usage-tracking is loaded. */
export interface IUsageCostReadyModel {
	readonly kind: 'ready';
	readonly groupBy: UsageGroupByAxis;
	readonly windowDays: number;
	readonly totals: IUsageTotalsPayload;
	/** `true` when the log has no invocations in the window. */
	readonly empty: boolean;
	readonly rows: readonly IUsageCostRow[];
	readonly expensiveCalls: readonly IUsageExpensiveCallPayload[];
	/** Always the two independent meters: `[session, monthly]`. */
	readonly meters: readonly [ISpendMeter, ISpendMeter];
	readonly breached: 'session' | 'monthly' | null;
	/** `false` when no `limitsStatus` was supplied (advise_spend absent). */
	readonly limitsAvailable: boolean;
}

/**
 * Degraded model when the usage-tracking plugin is not loaded (opt-in,
 * never in a preset). Hosts render the hint + snippet — never an error
 * state (f00098 non-goal).
 */
export interface IUsageCostAbsentModel {
	readonly kind: 'plugin-absent';
	readonly plugin: 'usage-tracking';
	readonly hint: string;
	readonly configSnippet: string;
}

export type IUsageCostCardModel = IUsageCostReadyModel | IUsageCostAbsentModel;
