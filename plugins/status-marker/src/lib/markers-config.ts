/**
 * User-configurable marker set (proposal f00071).
 *
 * The 8 built-in close-marker states live in {@link ./markers}. A host may
 * extend that table — *without forking the plugin* — by declaring a
 * `markers` block under `plugins.status-marker.options` in
 * `mcp-vertex.config.json`. This module owns the Zod schema for that block;
 * the merge semantics (built-in ⊕ user-set ⊕ overrides) live in
 * {@link ./markers}'s `mergeMarkerTable`.
 *
 * The three fields are disjoint operations on the effective table:
 *
 * | Field      | Effect                                                      |
 * |------------|-------------------------------------------------------------|
 * | `add`      | Append new states at the end of the iteration order.        |
 * | `disable`  | Remove a built-in state (never `HECHO` — it is the floor).  |
 * | `override` | Patch a built-in's `instruction`/`locales`/`requiresReason`. |
 *
 * Adding a marker is non-breaking for existing consumers (the wire enum
 * grows additively); disabling a built-in is breaking and must be opted
 * into explicitly. The `emoji` is part of the wire contract with consumers
 * that parse by emoji and is therefore NOT overridable.
 */

import { z } from 'zod';

/**
 * A single user-declared marker. The `id` doubles as the protocol `state`
 * token, so it must be an uppercase ASCII identifier disjoint from the
 * built-in state names. The `emoji` must be unique across the merged table.
 */
export const UserMarkerSchema = z.object({
	/** Uppercase ASCII identifier; used as the protocol `state` token. */
	id: z
		.string()
		.regex(/^[A-Z][A-Z0-9_-]*$/, 'id must be UPPER_SNAKE_CASE'),
	/**
	 * Single emoji or short symbol that prefixes the bracket. Must be unique
	 * across the merged table.
	 */
	emoji: z.string().min(1).max(8),
	/** Whether `<prefix>_close` will demand a reason for this state. */
	requiresReason: z.boolean(),
	/**
	 * Per-locale bracket text. Keys MUST be valid `CloseMarkerLocale`s.
	 * Missing locales fall back to the state name itself (matching the
	 * built-in behaviour).
	 */
	locales: z.record(z.string(), z.string().min(1)).optional(),
	/**
	 * Free-form guidance surfaced via `<prefix>_ping` so the agent knows
	 * when to emit the state. Without it an LLM given a new state would not
	 * know the semantic.
	 */
	instruction: z.string().min(1).max(280).optional(),
});

/** A patch applied to a built-in state via `override`. */
export const UserMarkerOverrideSchema = z.object({
	instruction: z.string().min(1).max(280).optional(),
	locales: z.record(z.string(), z.string().min(1)).optional(),
	requiresReason: z.boolean().optional(),
});

/**
 * The `markers` block under `plugins.status-marker.options`. All three
 * fields are optional — a host that declares none gets the built-in table
 * verbatim.
 */
export const UserMarkerConfigSchema = z.object({
	add: z.array(UserMarkerSchema).optional(),
	disable: z.array(z.string()).optional(),
	override: z.record(z.string(), UserMarkerOverrideSchema).optional(),
});

export type IUserMarkerDefinition = z.infer<typeof UserMarkerSchema>;
export type IUserMarkerOverride = z.infer<typeof UserMarkerOverrideSchema>;
export type IUserMarkerConfig = z.infer<typeof UserMarkerConfigSchema>;
