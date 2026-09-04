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

export interface DelendaiLogsCorrelateOutput {
	detail: "compact" | "normal" | "full";
	chain: unknown[];
	firstTs: string;
	lastTs: string;
	gaps: unknown;
}

export interface DelendaiLogsErrorsTailOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	oldestTs: string;
	newestTs: string;
}

export interface DelendaiLogsIncidentsOutput {
	incidents: unknown;
	totalIncidents: number;
}

export interface DelendaiLogsLogOutput {
	ok: true;
	ts: string;
	incidentType: string;
	severity: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
}

export interface DelendaiLogsQueryOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	cursor: string;
	hasMore: boolean;
}

export interface DelendaiLogsRedactTestOutput {
	detected: string[];
	redacted: string;
}

export interface DelendaiLogsSearchOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	matched: number;
	hasMore: boolean;
}

export interface DelendaiLogsSubscribeOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	stream: "logs";
}

export interface DelendaiLogsTailOutput {
	detail: "compact" | "normal" | "full";
	events: unknown[];
	oldestTs: string;
	newestTs: string;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface LogsToolOutputs {
	"delendai_logs_correlate": DelendaiLogsCorrelateOutput;
	"delendai_logs_errors_tail": DelendaiLogsErrorsTailOutput;
	"delendai_logs_incidents": DelendaiLogsIncidentsOutput;
	"delendai_logs_log": DelendaiLogsLogOutput;
	"delendai_logs_query": DelendaiLogsQueryOutput;
	"delendai_logs_redact_test": DelendaiLogsRedactTestOutput;
	"delendai_logs_search": DelendaiLogsSearchOutput;
	"delendai_logs_subscribe": DelendaiLogsSubscribeOutput;
	"delendai_logs_tail": DelendaiLogsTailOutput;
}
