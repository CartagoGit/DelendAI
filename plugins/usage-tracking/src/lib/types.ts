/**
 * types.ts — the on-disk record + rollup shapes for `usage-tracking`.
 *
 * The plugin records METADATA ONLY (never message content, never a
 * credential). Every field here is JSON-serialisable so the whole record
 * round-trips through `invocations.jsonl` and `usage-summary.json`.
 *
 * The provider vocabulary (`ProviderKind`) is imported from the core's
 * single canonical contract (`@mcp-vertex/core/public`, f00067 S1) so the
 * design text and the code never drift.
 */
import type { ProviderKind } from '@mcp-vertex/core/public';

/** The MCP caller behind a tool invocation. */
export interface IAgentDescriptor {
	/** Best-effort instance id (raw `clientInfo.name`, or `unknown`). */
	readonly id: string;
	/** Detected category, e.g. `copilot`, `claude-code`, `unknown`. */
	readonly kind: string;
	/** Detected surface, e.g. `vscode-copilot`, `cli`, `unknown`. */
	readonly extension: string;
}

/** Token usage a provider reported for a call (when known). */
export interface IUsageTokens {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly totalTokens?: number;
}

/** The model that handled a call (only known for orchestrated calls). */
export interface IModelDescriptor {
	readonly provider: string;
	readonly modelId: string;
	readonly kind: ProviderKind;
}

export type IInvocationOutcome = 'success' | 'error' | 'timeout' | 'fallback';

/** A single row of `invocations.jsonl`. Append-only; metadata only. */
export interface IInvocationRecord {
	readonly ts: string;
	readonly sessionId: string;
	readonly agent: IAgentDescriptor;
	readonly plugin: string;
	readonly tool: string;
	readonly model: IModelDescriptor | null;
	readonly usage: IUsageTokens | null;
	readonly costUsd: number | null;
	readonly durationMs: number | null;
	readonly outcome: IInvocationOutcome;
	readonly fallbackFrom: string | null;
	readonly error: { readonly code: string; readonly message: string } | null;
	/**
	 * Whether this invocation auto-bypassed the `confirmBeforeExecute` prompt
	 * (S6 I5 signed-token path). Stamped by the orchestrator on the invoke
	 * result and lifted here so the counter cannot be circumvented (S7 —
	 * "the counter increments inside the same code path that issues the
	 * invocation; not opt-in"). Older rows omit the field (parsed as false).
	 */
	readonly autoBypassed: boolean;
}

/** One grouped bucket in a rollup (keyed by the active `groupBy` axis). */
export interface IRollupBucket {
	readonly key: string;
	readonly calls: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly errors: number;
	/** How many of this bucket's calls auto-bypassed confirmation (S7). */
	readonly autoBypassed: number;
}

export interface IRollupTotals {
	readonly calls: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly errors: number;
	readonly autoBypassed: number;
}

/** The scope a spend cap was breached in (S7 circuit breaker). */
export type SpendBreachScope = 'session' | 'monthly';

/**
 * The circuit-breaker block written into `usage-summary.json#limitsStatus`
 * (S7). Rolling `sessionSpendUsd` counts since session start; `monthlySpendUsd`
 * counts a calendar-month window. The two windows are NEVER averaged into a
 * single number — each is compared against its own cap independently.
 */
export interface ILimitsStatus {
	readonly sessionSpendUsd: number;
	readonly sessionLimitUsd: number | null;
	readonly sessionLimitPct: number | null;
	readonly monthlySpendUsd: number;
	readonly monthlyLimitUsd: number | null;
	readonly monthlyLimitPct: number | null;
	readonly breached: SpendBreachScope | null;
}

/**
 * A recorded automatic degradation to a cheaper provider when a spend cap
 * breached under `fallbackStrategy:'rerank'` (S7 —
 * `usage-summary.json#degradations`).
 */
export interface IDegradation {
	readonly at: string;
	readonly scope: SpendBreachScope;
	readonly fromProvider: string;
	readonly toProvider: string;
	readonly observedUsd: number;
	readonly limitUsd: number;
}

/** The persisted `usage-summary.json` document. */
export interface IUsageSummary {
	readonly updatedAt: string;
	readonly windowDays: number;
	readonly totals: IRollupTotals;
	readonly byProvider: readonly IRollupBucket[];
	readonly byPlugin: readonly IRollupBucket[];
	readonly byAgent: readonly IRollupBucket[];
	readonly byExtension: readonly IRollupBucket[];
	/** Count of auto-bypassed invocations in the window (S7). */
	readonly autoBypassed: number;
	/** Rolling session/monthly spend vs the configured caps (S7). */
	readonly limitsStatus: ILimitsStatus;
	/** Automatic cheap-provider degradations, newest last (S7). */
	readonly degradations: readonly IDegradation[];
}

export type GroupByAxis = 'provider' | 'plugin' | 'agent' | 'extension';
export type SortBy = 'calls' | 'totalTokens' | 'costUsd';
