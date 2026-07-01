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

export interface LogsCorrelateOutput {
	chain: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	firstTs: string | null;
	lastTs: string | null;
	gaps: {
		startTs: string;
		endTs: string;
		durationMs: number;
	}[];
}

export interface LogsQueryOutput {
	events: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	cursor: string | null;
	hasMore: boolean;
}

export interface LogsRedactTestOutput {
	detected: string[];
	redacted: string;
}

export interface LogsSubscribeOutput {
	events: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	stream: "logs";
}

export interface LogsTailOutput {
	events: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	oldestTs: string | null;
	newestTs: string | null;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface LogsToolOutputs {
	"logs_correlate": LogsCorrelateOutput;
	"logs_query": LogsQueryOutput;
	"logs_redact_test": LogsRedactTestOutput;
	"logs_subscribe": LogsSubscribeOutput;
	"logs_tail": LogsTailOutput;
}
