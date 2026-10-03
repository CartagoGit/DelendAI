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

export interface DelendaiQualityComplexityOutput {
	ok: true;
	findings: {
		file: string;
		line: number;
		function: string;
		complexity: number;
		threshold: number;
	}[];
}

export interface DelendaiQualityCoverageOutput {
	ok: true | "skipped";
	scope?: "lines" | "branches" | "functions" | "all";
	lines?: {
		covered: number;
		total: number;
		pct: number;
	};
	branches?: {
		covered: number;
		total: number;
		pct: number;
	};
	functions?: {
		covered: number;
		total: number;
		pct: number;
	};
	hint?: string;
}

export interface DelendaiQualityGetQualityScopesOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiQualityQualityCancelOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiQualityQualityRunAllOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiQualityRunQualityOutput {
	ok?: boolean;
	[key: string]: unknown;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface IQualityToolOutputs {
	"delendai_quality_complexity": DelendaiQualityComplexityOutput;
	"delendai_quality_coverage": DelendaiQualityCoverageOutput;
	"delendai_quality_get_quality_scopes": DelendaiQualityGetQualityScopesOutput;
	"delendai_quality_quality_cancel": DelendaiQualityQualityCancelOutput;
	"delendai_quality_quality_run_all": DelendaiQualityQualityRunAllOutput;
	"delendai_quality_run_quality": DelendaiQualityRunQualityOutput;
}
