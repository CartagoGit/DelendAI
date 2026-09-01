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

export interface McpVertexSearchSearchOutput {
	detail?: "compact" | "normal" | "full";
	query: string;
	count: number;
	truncated: boolean;
	scanned: number;
	usedRg: boolean;
	rgFallbackReason?: string;
	diagnostic?: string;
	availableProviders: Array<{
		id: "openai" | "voyage" | "cohere";
		present: boolean;
	}>;
	hits: {
		file: string;
		line: number;
		text: string;
		before?: string[];
		after?: string[];
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface SearchToolOutputs {
	"mcp-vertex_search_search": McpVertexSearchSearchOutput;
}
