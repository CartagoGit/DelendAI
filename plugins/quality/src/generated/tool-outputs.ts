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

export interface McpVertexQualityGetQualityScopesOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexQualityQualityCancelOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexQualityQualityRunAllOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexQualityRunQualityOutput {
	ok?: boolean;
	[key: string]: unknown;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface QualityToolOutputs {
	"mcp-vertex_quality_get_quality_scopes": McpVertexQualityGetQualityScopesOutput;
	"mcp-vertex_quality_quality_cancel": McpVertexQualityQualityCancelOutput;
	"mcp-vertex_quality_quality_run_all": McpVertexQualityQualityRunAllOutput;
	"mcp-vertex_quality_run_quality": McpVertexQualityRunQualityOutput;
}
