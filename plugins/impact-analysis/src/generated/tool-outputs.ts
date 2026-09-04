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

export interface DelendaiImpactAnalysisImpactAnalyzeOutput {
	changedSymbols: string[];
	dependents: string[];
	affectedPackages: string[];
	recommendedTests: string[];
	risk: "low" | "medium" | "high";
	dependsOn: string[];
	bytes: number;
	truncated: boolean;
}

export interface DelendaiImpactAnalysisTestsForChangeOutput {
	run: string[];
	skip: string[];
	coverageFocus: string[];
	likelyRelatedFailures: string[];
	bytes: number;
	truncated: boolean;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface ImpactAnalysisToolOutputs {
	"delendai_impact-analysis_impact_analyze": DelendaiImpactAnalysisImpactAnalyzeOutput;
	"delendai_impact-analysis_tests_for_change": DelendaiImpactAnalysisTestsForChangeOutput;
}
