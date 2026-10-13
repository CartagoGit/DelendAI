export const IMPACT_ANALYSIS_RISKS = ['low', 'medium', 'high'] as const;

export type TImpactAnalysisRisk = (typeof IMPACT_ANALYSIS_RISKS)[number];

export const IMPACT_ANALYSIS_SECTION_NAMES = [
	'changedSymbols',
	'dependents',
	'affectedPackages',
	'recommendedTests',
	'run',
	'skip',
	'coverageFocus',
	'likelyRelatedFailures',
] as const;

export type TImpactAnalysisSectionName =
	(typeof IMPACT_ANALYSIS_SECTION_NAMES)[number];

export interface IImpactAnalysisPluginOptions {
	readonly maxBytes?: number;
}

export interface IImpactAnalyzeToolArgs {
	readonly files?: readonly string[] | undefined;
	readonly gitDiff?: string | undefined;
	readonly symbols?: readonly string[] | undefined;
}

export interface ITestsForChangeToolArgs {
	readonly files?: readonly string[] | undefined;
	readonly symbols?: readonly string[] | undefined;
}

export interface IImpactAnalysisSection {
	readonly name: TImpactAnalysisSectionName;
	readonly items: readonly string[];
}

export interface IImpactAnalyzeOutput {
	readonly changedSymbols: readonly string[];
	readonly dependents: readonly string[];
	readonly affectedPackages: readonly string[];
	readonly recommendedTests: readonly string[];
	readonly risk: TImpactAnalysisRisk;
	readonly dependsOn: readonly string[];
	readonly bytes: number;
	readonly truncated: boolean;
}

export interface ITestsForChangeOutput {
	readonly run: readonly string[];
	readonly skip: readonly string[];
	readonly coverageFocus: readonly string[];
	readonly likelyRelatedFailures: readonly string[];
	readonly bytes: number;
	readonly truncated: boolean;
}

export interface IImpactAnalysisToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly maxBytes: number;
}
