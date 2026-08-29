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
	scopes: Record<string, {
		command: string;
		expect?: string;
	}[]>;
}

export interface McpVertexQualityQualityCancelOutput {
	cancelled: number[];
	count: number;
}

export interface McpVertexQualityQualityRunAllOutput {
	results: {
		scope: string;
		ok: boolean;
		duration: number;
		errors: string[];
	}[];
	summary: {
		ok: boolean;
		scopes: number;
	};
}

export interface McpVertexQualityRunQualityOutput {
	scope?: string;
	ok: boolean;
	dryRun?: boolean;
	commands?: string[];
	results?: {
		command: string;
		ok: boolean;
		code: number;
		timedOut: boolean;
		tail: string;
	}[];
	severities?: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst?: "critical" | "high" | "medium" | "low" | "info" | "none";
	findings?: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
		fix?: string;
	}>;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface QualityToolOutputs {
	"mcp-vertex_quality_get_quality_scopes": McpVertexQualityGetQualityScopesOutput;
	"mcp-vertex_quality_quality_cancel": McpVertexQualityQualityCancelOutput;
	"mcp-vertex_quality_quality_run_all": McpVertexQualityQualityRunAllOutput;
	"mcp-vertex_quality_run_quality": McpVertexQualityRunQualityOutput;
}
