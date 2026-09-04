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

export interface DelendaiProjectHealthProjectHealthOutput {
	detail?: "compact" | "normal" | "full";
	score?: number;
	security?: number;
	deps?: number;
	quality?: number;
	debt?: number;
	next?: {
		tool: string;
		reason: string;
	}[];
	domain?: "summary" | "security" | "deps" | "quality" | "debt";
	tool?: string;
	hint?: string;
	dependsOn?: string[];
	bytes: number;
	truncated: boolean;
	originalBytes?: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface ProjectHealthToolOutputs {
	"delendai_project-health_project_health": DelendaiProjectHealthProjectHealthOutput;
}
