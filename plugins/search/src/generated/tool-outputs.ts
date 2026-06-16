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

export interface SearchSearchOutput {
	query: string;
	count: number;
	truncated: boolean;
	scanned: number;
	hits: {
		file: string;
		line: number;
		text: string;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface SearchToolOutputs {
	"search_search": SearchSearchOutput;
}
