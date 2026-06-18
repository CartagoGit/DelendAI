import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * What a tool can DO beyond reading, so a host/agent can reason about trust and
 * gate dangerous capabilities (M31). A tool with no declared effects is
 * read-only (the safe default). Surfaced per tool by `overview`.
 *
 * - `write`       — mutates persisted state (workspace files, store, coordination).
 * - `spawn`       — runs external processes / shell commands.
 * - `network`     — performs network I/O.
 * - `destructive` — deletes/overwrites in a way that is not trivially reversible.
 */
export type IToolEffect = 'write' | 'spawn' | 'network' | 'destructive';

/**
 * A unit of the deterministic registration sequence. Registration
 * order is semantically load-bearing,
 * so it is expressed as data and planned by `planRegistrationOrder`
 * instead of being implicit in call order.
 */
export interface IToolRegistration {
	/** Stable registration id, unique within the sequence. */
	readonly id: string;
	/**
	 * Insert this registration immediately after the registration
	 * with the given id. When omitted the registration is appended
	 * at the end of the sequence, preserving declaration order.
	 */
	readonly registerAfter?: string | undefined;
	/**
	 * One-line capability summary surfaced by the `overview` tool so any
	 * agent can map the server in a single call. Optional but
	 * recommended; keep it short and action-oriented.
	 */
	readonly summary?: string | undefined;
	/** Optional grouping tags, e.g. `['coordination']`, `['lazy']`. */
	readonly tags?: readonly string[] | undefined;
	/**
	 * Side effects this tool can have (M31). Omit for read-only tools. Surfaced
	 * by `overview` so a host can warn on / gate write/spawn/destructive tools.
	 */
	readonly effects?: readonly IToolEffect[] | undefined;
	register(server: McpServer): Promise<void>;
}

export interface IPromptRegistration {
	readonly id: string;
	register(server: McpServer): Promise<void>;
}

export interface IResourceRegistration {
	readonly id: string;
	register(server: McpServer): Promise<void>;
}
