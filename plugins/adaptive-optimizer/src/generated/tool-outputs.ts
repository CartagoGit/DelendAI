/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface McpVertexAdaptiveOptimizerActivationMetricsOutput {
	activations: number;
	responses: {
		hasSamples: false;
	} | {
		hasSamples: true;
		p95PayloadBytes: number;
	};
}

export interface McpVertexAdaptiveOptimizerAdaptiveFacadeOutput {
	intent: "orient" | "plan" | "claim" | "progress" | "close" | "recover";
	preferredPath: {
		intent: "orient" | "plan" | "claim" | "progress" | "close" | "recover";
		toolName: string;
		plugin: "proposals";
		effect: "read" | "write" | "recovery";
		summary: string;
		metrics: {
			successRate: number;
			tokenCost: number;
			callCount: number;
			latencyMs: number;
			sideEffectRisk: number;
			usedObservedHistory: boolean;
		};
		score: number;
		utility: number;
		relevance: number;
		confidence: number;
		tokenTax: number;
		latencyTax: number;
		permissionRisk: number;
	};
	alternatives: Array<{
		intent: "orient" | "plan" | "claim" | "progress" | "close" | "recover";
		toolName: string;
		plugin: "proposals";
		effect: "read" | "write" | "recovery";
		summary: string;
		metrics: {
			successRate: number;
			tokenCost: number;
			callCount: number;
			latencyMs: number;
			sideEffectRisk: number;
			usedObservedHistory: boolean;
		};
		score: number;
		utility: number;
		relevance: number;
		confidence: number;
		tokenTax: number;
		latencyTax: number;
		permissionRisk: number;
	}>;
	detailedSurface: {
		name: string;
		plugin: string;
		sinceVersion: string;
		semverGuarantee: "additive-only";
		summary: string;
		inputSchema: unknown;
		outputSchema: unknown;
	}[];
	bytes: number;
	truncated: boolean;
}

export interface McpVertexAdaptiveOptimizerOptimizeRunOutput {
	ranked: {
		id: string;
		score: number;
		utility: number;
		relevance: number;
		confidence: number;
		tokenTax: number;
		latencyTax: number;
		permissionRisk: number;
	}[];
	budget: number;
	consent: boolean;
	bytes: number;
	truncated: boolean;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface AdaptiveOptimizerToolOutputs {
	"mcp-vertex_adaptive-optimizer_activation_metrics": McpVertexAdaptiveOptimizerActivationMetricsOutput;
	"mcp-vertex_adaptive-optimizer_adaptive_facade": McpVertexAdaptiveOptimizerAdaptiveFacadeOutput;
	"mcp-vertex_adaptive-optimizer_optimize_run": McpVertexAdaptiveOptimizerOptimizeRunOutput;
}
