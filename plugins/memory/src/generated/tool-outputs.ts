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

export interface McpVertexMemoryCheckpointPacketOutput {
	available: boolean;
	packet: unknown | null;
	advisory?: unknown;
}

export interface McpVertexMemoryCompactOutput {
	digest: string;
	sections: unknown;
	tokenAccounting: unknown;
	persisted: boolean;
	noteId?: string;
	redactedSecrets: number;
	preservation: {
		ok: boolean;
		droppedCount: number;
		dropped: {
			category: string;
			text: string;
		}[];
		nextAction: string;
	};
}

export interface McpVertexMemoryCompactionCheckOutput {
	shouldCompact: boolean;
	reason: "token-threshold" | "turn-threshold" | "below-threshold";
	carriedTailTokens: number;
	tokenThreshold: number;
	turnsSinceLastCompaction: number;
	turnThreshold: number;
	hint: string;
}

export interface McpVertexMemoryExportOutput {
	ok: true;
	format: "json" | "ndjson";
	payload: string;
	count: number;
}

export interface McpVertexMemoryForgetOutput {
	ok: true;
	removed: string;
}

export interface McpVertexMemoryImportOutput {
	ok: true;
	imported: number;
	skipped: number;
	overwritten: number;
	merged: number;
	total: number;
	redactedSecrets: number;
}

export interface McpVertexMemoryListOutput {
	notes: {
		id: string;
		title: string;
		tags: string[];
	}[];
	total: number;
	offset: number;
	nextOffset?: number;
}

export interface McpVertexMemoryRecallOutput {
	notes: {
		id: string;
		title: string;
		body: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		expiresAt?: string;
	}[];
	sessionDigest?: {
		title: string;
		topic: string;
		body: string;
		createdAt: string;
	};
}

export interface McpVertexMemorySaveOutput {
	ok: true;
	saved: {
		id: string;
		title: string;
		body: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		expiresAt?: string;
	};
	redactedSecrets: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface MemoryToolOutputs {
	"mcp-vertex_memory_checkpoint_packet": McpVertexMemoryCheckpointPacketOutput;
	"mcp-vertex_memory_compact": McpVertexMemoryCompactOutput;
	"mcp-vertex_memory_compaction_check": McpVertexMemoryCompactionCheckOutput;
	"mcp-vertex_memory_export": McpVertexMemoryExportOutput;
	"mcp-vertex_memory_forget": McpVertexMemoryForgetOutput;
	"mcp-vertex_memory_import": McpVertexMemoryImportOutput;
	"mcp-vertex_memory_list": McpVertexMemoryListOutput;
	"mcp-vertex_memory_recall": McpVertexMemoryRecallOutput;
	"mcp-vertex_memory_save": McpVertexMemorySaveOutput;
}
