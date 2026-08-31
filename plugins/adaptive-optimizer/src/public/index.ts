/**
 * Public surface of `@mcp-vertex/adaptive-optimizer`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the scoring surface, tool builder, output schema and types for reuse.
 */
export { default } from '../index';

export {
	AdaptiveFacadeOutputSchema,
	buildAdaptiveFacadeToolRegistration,
	runAdaptiveFacade,
} from '../lib/tools/adaptive-facade.tool';
export {
	buildAdaptiveOptimizerToolRegistrations,
	OptimizeRunOutputSchema,
	runOptimizeRun,
} from '../lib/tools/optimize-run.tool';
export { buildActivationMetricsToolRegistration } from '../lib/tools/activation-metrics.tool';
export { createActivationMetricsRegistry } from '../lib/metrics/activation-metrics-registry';
export type {
	IActivationMetricsRegistry,
	IActivationMetricsSnapshot,
	IActivationMetricsToolOptions,
} from '../lib/contracts/interfaces/adaptive-optimizer.interface';
// `computePayloadPercentile`/`IPayloadPercentile` now live in
// `@mcp-vertex/core` (the shared contract with `observability` and the
// metrics longitudinal gate); re-exported here so this plugin's public
// surface is unchanged for existing consumers.
export { computePayloadPercentile } from '@mcp-vertex/core/public';
export type { IPayloadPercentile } from '@mcp-vertex/core/public';
export { scoreOptimizationCandidate } from '../lib/services/optimization-scoring.service';
export type {
	IAdaptiveFacadeCandidate,
	IAdaptiveFacadeHistoryEntry,
	IAdaptiveFacadeMetrics,
	IAdaptiveFacadeOutput,
	IAdaptiveFacadeRuntimeOptions,
	IAdaptiveFacadeToolArgs,
	IAdaptiveOptimizerPluginOptions,
	IOptimizationCandidate,
	IOptimizationRankedCandidate,
	IOptimizationScore,
	IOptimizationSignalOverrides,
	IOptimizationSignals,
	IOptimizeRunOutput,
	IOptimizeRunRuntimeOptions,
	IOptimizeRunToolArgs,
	TAdaptiveFacadeEffect,
	TAdaptiveFacadeIntent,
} from '../lib/contracts/interfaces/adaptive-optimizer.interface';

// --- generated tool-output types ---
export type * from '../generated/tool-outputs';
