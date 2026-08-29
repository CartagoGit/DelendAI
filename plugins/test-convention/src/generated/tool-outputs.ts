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

export interface McpVertexTestConventionGetConventionOutput {
	convention: {
		specExtension: string;
		specLayout: "colocate" | "tests-mirror" | "tests-flat";
		runners: string[];
		mockStyle: "vi" | "jest" | "auto";
		requireDescribe: boolean;
		coverageThreshold: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		forbiddenPatterns: string[];
		languages: string[];
	};
	markdown: string;
}

export interface McpVertexTestConventionScanDriftOutput {
	ok: boolean;
	counts: {
		error: number;
		warning: number;
		info: number;
	};
	violations: Array<{
		id: string;
		file: string;
		severity: "error" | "warning" | "info";
		hint: string;
		line?: number;
		excerpt?: string;
	}>;
	scannedFiles: number;
}

export interface McpVertexTestConventionSuggestSpecPathOutput {
	specPath: string;
	rationale: string;
	skeleton: string;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface TestConventionToolOutputs {
	"mcp-vertex_test-convention_get_convention": McpVertexTestConventionGetConventionOutput;
	"mcp-vertex_test-convention_scan_drift": McpVertexTestConventionScanDriftOutput;
	"mcp-vertex_test-convention_suggest_spec_path": McpVertexTestConventionSuggestSpecPathOutput;
}
