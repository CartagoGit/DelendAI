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

export interface MemoryExportOutput {
	ok: true;
	format: "json" | "ndjson";
	payload: string;
	count: number;
}

export interface MemoryForgetOutput {
	ok: true;
	removed: string;
}

export interface MemoryImportOutput {
	ok: true;
	imported: number;
	skipped: number;
	overwritten: number;
	merged: number;
	total: number;
	redactedSecrets: number;
}

export interface MemoryListOutput {
	notes: {
		id: string;
		title: string;
		tags: string[];
	}[];
	total: number;
	offset: number;
	nextOffset?: number;
}

export interface MemoryRecallOutput {
	notes: {
		id: string;
		title: string;
		body: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		expiresAt?: string;
	}[];
}

export interface MemorySaveOutput {
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
	"memory_export": MemoryExportOutput;
	"memory_forget": MemoryForgetOutput;
	"memory_import": MemoryImportOutput;
	"memory_list": MemoryListOutput;
	"memory_recall": MemoryRecallOutput;
	"memory_save": MemorySaveOutput;
}
