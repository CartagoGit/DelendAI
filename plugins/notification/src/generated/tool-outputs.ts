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

export interface McpVertexNotificationAwaitLockOutput {
	taskId: string;
	released: boolean;
	timedOut: boolean;
	alreadyFree: boolean;
	waitedMs: number;
}

export interface McpVertexNotificationNotifyStatusOutput {
	watching: string;
	emitted: number;
	lastReleases: {
		taskId: string;
		agent: string;
		files: string[];
	}[];
	agentEvents: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface NotificationToolOutputs {
	"mcp-vertex_notification_await_lock": McpVertexNotificationAwaitLockOutput;
	"mcp-vertex_notification_notify_status": McpVertexNotificationNotifyStatusOutput;
}
