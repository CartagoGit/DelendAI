import type { PermissionCategory } from '@mcp-vertex/core/public';
import type { IDiscoveredRoster } from '@mcp-vertex/auto-agent-selector/public';

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

export interface IOptimizeRunRuntimeOptions {
	readonly workspaceRootAbs: string;
	readonly maxBytes: number;
	readonly hostName?: string | undefined;
	readonly discoverRosterFn?: (() => Promise<IDiscoveredRoster>) | undefined;
}
