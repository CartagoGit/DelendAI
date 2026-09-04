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

export interface DelendaiMemoryCheckpointPacketOutput {
	available: boolean;
	packet: unknown | null;
	advisory?: unknown;
}

export interface DelendaiMemoryCompactOutput {
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

export interface DelendaiMemoryCompactionCheckOutput {
	shouldCompact: boolean;
	reason: "token-threshold" | "turn-threshold" | "below-threshold";
	carriedTailTokens: number;
	tokenThreshold: number;
	turnsSinceLastCompaction: number;
	turnThreshold: number;
	hint: string;
}

export interface DelendaiMemoryExportOutput {
	ok: true;
	format: "json" | "ndjson";
	payload: string;
	count: number;
}

export interface DelendaiMemoryForgetOutput {
	ok: true;
	removed: string;
}

export interface DelendaiMemoryImportOutput {
	ok: true;
	imported: number;
	skipped: number;
	overwritten: number;
	merged: number;
	total: number;
	redactedSecrets: number;
}

export interface DelendaiMemoryListOutput {
	notes: {
		id: string;
		title: string;
		tags: string[];
	}[];
	total: number;
	offset: number;
	nextOffset?: number;
}

export interface DelendaiMemoryRecallOutput {
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

export interface DelendaiMemorySaveOutput {
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
	"delendai_memory_checkpoint_packet": DelendaiMemoryCheckpointPacketOutput;
	"delendai_memory_compact": DelendaiMemoryCompactOutput;
	"delendai_memory_compaction_check": DelendaiMemoryCompactionCheckOutput;
	"delendai_memory_export": DelendaiMemoryExportOutput;
	"delendai_memory_forget": DelendaiMemoryForgetOutput;
	"delendai_memory_import": DelendaiMemoryImportOutput;
	"delendai_memory_list": DelendaiMemoryListOutput;
	"delendai_memory_recall": DelendaiMemoryRecallOutput;
	"delendai_memory_save": DelendaiMemorySaveOutput;
}
