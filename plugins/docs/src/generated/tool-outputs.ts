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

export interface McpVertexDocsDocsListOutput {
	count: number;
	total: number;
	offset: number;
	nextOffset?: number;
	truncated: boolean;
	diagnostic?: string;
	docs: {
		path: string;
		title: string;
	}[];
}

export interface McpVertexDocsDocsReadOutput {
	path: string;
	title: string;
	content: string;
	truncated: boolean;
	found: boolean;
	reason?: string;
}

export interface McpVertexDocsDocsSearchOutput {
	ok: false;
	error: {
		reason: "deprecated";
		replacement: string;
		since: string;
		note?: string;
	};
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface DocsToolOutputs {
	"mcp-vertex_docs_docs_list": McpVertexDocsDocsListOutput;
	"mcp-vertex_docs_docs_read": McpVertexDocsDocsReadOutput;
	"mcp-vertex_docs_docs_search": McpVertexDocsDocsSearchOutput;
}
