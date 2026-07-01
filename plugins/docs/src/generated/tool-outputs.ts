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

export interface DocsDocsListOutput {
	count: number;
	total: number;
	offset: number;
	nextOffset?: number;
	truncated: boolean;
	docs: {
		path: string;
		title: string;
	}[];
}

export interface DocsDocsReadOutput {
	path: string;
	title: string;
	content: string;
	truncated: boolean;
	found: boolean;
}

export interface DocsDocsSearchOutput {
	hits: {
		path: string;
		title: string;
		score: number;
		snippet: string;
	}[];
	truncated: boolean;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface DocsToolOutputs {
	"docs_docs_list": DocsDocsListOutput;
	"docs_docs_read": DocsDocsReadOutput;
	"docs_docs_search": DocsDocsSearchOutput;
}
