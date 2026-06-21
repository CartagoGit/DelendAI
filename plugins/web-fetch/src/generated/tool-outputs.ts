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

export interface WebFetchWebFetchOutput {
	ok: boolean;
	url?: string;
	status?: number;
	contentType?: string | null;
	body?: string;
	truncated?: boolean;
	reason?: "blocked-host" | "invalid-url" | "redirect-blocked" | "too-many-redirects" | "timeout" | "fetch-error";
	detail?: string;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface WebFetchToolOutputs {
	"web-fetch_web_fetch": WebFetchWebFetchOutput;
}
