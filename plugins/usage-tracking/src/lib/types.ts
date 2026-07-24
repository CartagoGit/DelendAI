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
	/**
	 * Bytes returned by the MCP tool. This is a local output-volume measure,
	 * not an estimate of the host conversation or provider context.
	 * Older rows omit it and are treated as zero.
	 */
	readonly responseBytes?: number;
	readonly costUsd: number | null;
	/** Saving reported by this call; absent on legacy rows and treated as 0. */
	readonly tokensSaved?: number;
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
	readonly tokensSaved: number;
	readonly savingsPercent: number;
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
	readonly tokensSaved: number;
	readonly savingsPercent: number;
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

export type GroupByAxis =
	| 'provider'
	| 'plugin'
	| 'agent'
	| 'extension'
	| 'model';
export type SortBy = 'calls' | 'totalTokens' | 'tokensSaved' | 'costUsd';

/** A threshold exceeded by an observed MCP session. */
export type SessionHygieneReason =
	| 'session-age'
	| 'idle-gap'
	| 'mcp-output-volume';

/** Policy for local MCP-session observations. All values are positive. */
export interface ISessionHygienePolicy {
	readonly maxSessionAgeMs: number;
	readonly maxIdleGapMs: number;
	readonly maxMcpOutputTokens: number;
}

/** Bounded, host-honest snapshot derived from MCP invocation metadata only. */
export interface ISessionHygieneSnapshot {
	readonly sessionId: string;
	readonly observedMcpOnly: true;
	readonly firstActivityAt: string;
	readonly lastActivityAt: string;
	readonly observedElapsedMs: number;
	readonly largestIdleGapMs: number;
	readonly calls: number;
	readonly responseBytes: number;
	readonly estimatedMcpOutputTokens: number;
	readonly reasons: readonly SessionHygieneReason[];
}

/** A one-shot advisory emitted when a local session first crosses a threshold. */
export interface ISessionHygieneAdvisory extends ISessionHygieneSnapshot {
	readonly newlyBreached: readonly SessionHygieneReason[];
	readonly recommendedAction: 'checkpoint-and-compact' | 'resume-from-digest';
}

/** A transcript-free lifecycle event emitted by a host adapter. */
export type HostLifecycleEventKind =
	| 'turn'
	| 'pre-compact'
	| 'post-compact'
	| 'session-end';

/**
 * One append-only host lifecycle row. `hostSessionId` is opaque metadata
 * supplied by the host; it is not assumed to be an MCP or provider session.
 */
export interface IHostLifecycleEvent {
	readonly version: 1;
	readonly host: 'claude-code';
	readonly hostSessionId: string;
	readonly event: HostLifecycleEventKind;
	readonly at: string;
}

/** A bounded summary of a host session derived from lifecycle events only. */
export interface IObservedHostSession {
	readonly hostSessionId: string;
	readonly observedHostOnly: true;
	readonly firstActivityAt: string;
	readonly lastActivityAt: string;
	readonly observedElapsedMs: number;
	readonly turnCount: number;
	readonly preCompactCount: number;
	readonly postCompactCount: number;
	readonly sessionEndCount: number;
	readonly lastEvent: HostLifecycleEventKind;
	/** Present only when the host explicitly supplied the same id to MCP. */
	readonly explicitMcpSessionIdMatch: boolean;
	readonly matchingMcpCalls: number;
}
