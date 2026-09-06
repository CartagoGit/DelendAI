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

export interface IDelendaiMemoryCheckpointPacketOutput {
	available: boolean;
	packet: unknown | null;
	advisory?: unknown;
}

export interface IDelendaiMemoryCompactOutput {
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

export interface IDelendaiMemoryCompactionCheckOutput {
	shouldCompact: boolean;
	reason: "token-threshold" | "turn-threshold" | "below-threshold";
	carriedTailTokens: number;
	tokenThreshold: number;
	turnsSinceLastCompaction: number;
	turnThreshold: number;
	hint: string;
}

export interface IDelendaiMemoryExportOutput {
	ok: true;
	format: "json" | "ndjson";
	payload: string;
	count: number;
}

export interface IDelendaiMemoryForgetOutput {
	ok: true;
	removed: string;
}

export interface IDelendaiMemoryImportOutput {
	ok: true;
	imported: number;
	skipped: number;
	overwritten: number;
	merged: number;
	total: number;
	redactedSecrets: number;
}

export interface IDelendaiMemoryListOutput {
	notes: {
		id: string;
		title: string;
		tags: string[];
	}[];
	total: number;
	offset: number;
	nextOffset?: number;
}

export interface IDelendaiMemoryRecallOutput {
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

export interface IDelendaiMemorySaveOutput {
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
	"delendai_memory_checkpoint_packet": IDelendaiMemoryCheckpointPacketOutput;
	"delendai_memory_compact": IDelendaiMemoryCompactOutput;
	"delendai_memory_compaction_check": IDelendaiMemoryCompactionCheckOutput;
	"delendai_memory_export": IDelendaiMemoryExportOutput;
	"delendai_memory_forget": IDelendaiMemoryForgetOutput;
	"delendai_memory_import": IDelendaiMemoryImportOutput;
	"delendai_memory_list": IDelendaiMemoryListOutput;
	"delendai_memory_recall": IDelendaiMemoryRecallOutput;
	"delendai_memory_save": IDelendaiMemorySaveOutput;
}
