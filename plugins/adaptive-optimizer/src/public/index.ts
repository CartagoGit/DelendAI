/**
 * Public surface of `@mcp-vertex/adaptive-optimizer`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the scoring surface, tool builder, output schema and types for reuse.
 */
export { default } from '../index';

export {
	buildAdaptiveOptimizerToolRegistrations,
	OptimizeRunOutputSchema,
	runOptimizeRun,
} from '../lib/tools/optimize-run.tool';
export { scoreOptimizationCandidate } from '../lib/services/optimization-scoring.service';
export type {
	IAdaptiveOptimizerPluginOptions,
	IOptimizationCandidate,
	IOptimizationRankedCandidate,
	IOptimizationScore,
	IOptimizationSignalOverrides,
	IOptimizationSignals,
	IOptimizeRunOutput,
	IOptimizeRunRuntimeOptions,
	IOptimizeRunToolArgs,
} from '../lib/contracts/interfaces/adaptive-optimizer.interface';

// --- generated tool-output types ---
export type * from '../generated/tool-outputs';
