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

export interface McpVertexLogsCorrelateOutput {
	detail: "compact" | "normal" | "full";
	chain: unknown[];
	firstTs: string | null;
	lastTs: string | null;
	gaps: unknown;
}

export interface McpVertexLogsErrorsTailOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	oldestTs: string | null;
	newestTs: string | null;
}

export interface McpVertexLogsIncidentsOutput {
	incidents: unknown;
	totalIncidents: number;
}

export interface McpVertexLogsLogOutput {
	ok: true;
	ts: string;
	incidentType: string;
	severity: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
}

export interface McpVertexLogsQueryOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	cursor: string | null;
	hasMore: boolean;
}

export interface McpVertexLogsRedactTestOutput {
	detected: string[];
	redacted: string;
}

export interface McpVertexLogsSearchOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	matched: number;
	hasMore: boolean;
}

export interface McpVertexLogsSubscribeOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	stream: "logs";
}

export interface McpVertexLogsTailOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	oldestTs: string | null;
	newestTs: string | null;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface LogsToolOutputs {
	"mcp-vertex_logs_correlate": McpVertexLogsCorrelateOutput;
	"mcp-vertex_logs_errors_tail": McpVertexLogsErrorsTailOutput;
	"mcp-vertex_logs_incidents": McpVertexLogsIncidentsOutput;
	"mcp-vertex_logs_log": McpVertexLogsLogOutput;
	"mcp-vertex_logs_query": McpVertexLogsQueryOutput;
	"mcp-vertex_logs_redact_test": McpVertexLogsRedactTestOutput;
	"mcp-vertex_logs_search": McpVertexLogsSearchOutput;
	"mcp-vertex_logs_subscribe": McpVertexLogsSubscribeOutput;
	"mcp-vertex_logs_tail": McpVertexLogsTailOutput;
}
