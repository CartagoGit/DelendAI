/**
 * Public surface of `@delendai/impact-analysis`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the tool builders, output schemas and types for programmatic reuse.
 */
export { default } from '../index';

export {
	buildImpactAnalyzeToolRegistrations,
	buildImpactAnalysisToolRegistrations,
	ImpactAnalyzeOutputSchema,
	runImpactAnalyze,
} from '../lib/tools/impact-analyze.tool';
export {
	buildTestsForChangeToolRegistrations,
	TestsForChangeOutputSchema,
	runTestsForChange,
} from '../lib/tools/tests-for-change.tool';
export type {
	IImpactAnalysisPluginOptions,
	IImpactAnalysisSection,
	IImpactAnalyzeOutput,
	IImpactAnalyzeToolArgs,
	IImpactAnalysisToolOptions,
	ITestsForChangeOutput,
	ITestsForChangeToolArgs,
	TImpactAnalysisRisk,
	TImpactAnalysisSectionName,
} from '../lib/contracts/interfaces/impact-analysis.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
