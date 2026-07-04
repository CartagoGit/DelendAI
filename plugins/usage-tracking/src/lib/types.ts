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
}

export interface IRollupTotals {
	readonly calls: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly errors: number;
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
}

export type GroupByAxis = 'provider' | 'plugin' | 'agent' | 'extension';
export type SortBy = 'calls' | 'totalTokens' | 'costUsd';
