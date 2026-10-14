import type {
	IStableManifestTool,
	IPayloadPercentile,
	PermissionCategory,
} from '@delendai/core/public';
import type { IDiscoveredRoster } from '@delendai/auto-agent-selector/public';

export interface IOptimizationSignals {
	readonly successRate: number;
	readonly tokenCost: number;
	readonly latencyMs: number;
	readonly relevance: number;
	readonly confidence: number;
	readonly permissionRisk?: number | undefined;
}

export interface IOptimizationSignalOverrides {
	readonly successRate?: number | undefined;
	readonly tokenCost?: number | undefined;
	readonly latencyMs?: number | undefined;
	readonly relevance?: number | undefined;
	readonly confidence?: number | undefined;
	readonly permissionRisk?: number | undefined;
}

export interface IOptimizationCandidate {
	readonly id: string;
	readonly model?: string | undefined;
	readonly pluginSet?: readonly string[] | undefined;
	readonly prompt?: string | undefined;
	readonly toolDescription?: string | undefined;
	readonly permissions?: readonly PermissionCategory[] | undefined;
	readonly signals?: IOptimizationSignalOverrides | undefined;
}

export interface IOptimizationScore {
	readonly score: number;
	readonly utility: number;
	readonly relevance: number;
	readonly confidence: number;
	readonly tokenTax: number;
	readonly latencyTax: number;
	readonly permissionRisk: number;
}

export interface IOptimizationRankedCandidate extends IOptimizationScore {
	readonly id: string;
}

export interface IOptimizeRunToolArgs {
	readonly task?: string | undefined;
	readonly candidates: readonly IOptimizationCandidate[];
	readonly budget: number;
	readonly consent: boolean;
}

export interface IOptimizeRunOutput {
	readonly ranked: readonly IOptimizationRankedCandidate[];
	readonly budget: number;
	readonly consent: boolean;
	readonly bytes: number;
	readonly truncated: boolean;
}

export interface IAdaptiveOptimizerPluginOptions {
	readonly maxBytes?: number | undefined;
}

export type TAdaptiveFacadeIntent =
	| 'orient'
	| 'plan'
	| 'claim'
	| 'progress'
	| 'close'
	| 'recover';

export type TAdaptiveFacadeEffect = 'read' | 'write' | 'recovery';

export interface IAdaptiveFacadeHistoryEntry {
	readonly tool: string;
	readonly outcome: 'success' | 'error' | 'timeout' | 'fallback';
	readonly totalTokens?: number | undefined;
	readonly inputTokens?: number | undefined;
	readonly outputTokens?: number | undefined;
	readonly durationMs?: number | undefined;
}

export interface IAdaptiveFacadeMetrics {
	readonly successRate: number;
	readonly tokenCost: number;
	readonly callCount: number;
	readonly latencyMs: number;
	readonly sideEffectRisk: number;
	readonly usedObservedHistory: boolean;
}

export interface IAdaptiveFacadeCandidate extends IOptimizationScore {
	readonly intent: TAdaptiveFacadeIntent;
	readonly toolName: string;
	readonly plugin: 'proposals';
	readonly effect: TAdaptiveFacadeEffect;
	readonly summary: string;
	readonly metrics: IAdaptiveFacadeMetrics;
}

export interface IAdaptiveFacadeOutput {
	readonly intent: TAdaptiveFacadeIntent;
	readonly preferredPath: IAdaptiveFacadeCandidate;
	readonly alternatives: readonly IAdaptiveFacadeCandidate[];
	readonly detailedSurface: readonly IStableManifestTool[];
	readonly bytes: number;
	readonly truncated: boolean;
}

export interface IAdaptiveFacadeToolArgs {
	readonly intent: TAdaptiveFacadeIntent;
	readonly task?: string | undefined;
	readonly history?: readonly IAdaptiveFacadeHistoryEntry[] | undefined;
	readonly maxAlternatives?: number | undefined;
	readonly maxBytes?: number | undefined;
}

export interface IAdaptiveFacadeRuntimeOptions {
	readonly maxBytes?: number | undefined;
}

export interface IOptimizeRunRuntimeOptions {
	readonly workspaceRootAbs: string;
	readonly maxBytes: number;
	readonly hostName?: string | undefined;
	readonly discoverRosterFn?: (() => Promise<IDiscoveredRoster>) | undefined;
}

/** A snapshot of `optimize_run` activation counts and response sizes. */
export interface IActivationMetricsSnapshot {
	readonly activations: number;
	readonly responses: IPayloadPercentile;
}

/**
 * Per-process registry of `optimize_run` activations, read by
 * `activation_metrics`. Backs the metrics longitudinal gate's candidate
 * snapshot for this plugin instead of the gate calling a tool name that
 * was never registered.
 *
 * The sampling mechanics (push a byte size, derive a p95) are shared with
 * the `observability` plugin's runtime registry via
 * `createByteSamplePercentileRegistry` in `@delendai/core`; only the
 * vocabulary here (`activations`, `recordActivation`) is specific to this
 * plugin.
 */
export interface IActivationMetricsRegistry {
	recordActivation(responseBytes: number): void;
	snapshot(): IActivationMetricsSnapshot;
	reset(): void;
}

export interface IActivationMetricsToolOptions {
	readonly namespacePrefix: string;
	readonly registry: IActivationMetricsRegistry;
}
