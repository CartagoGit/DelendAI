import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TToolDisclosureLevel } from './tool-surface.interface';

/**
 * What a tool can DO beyond reading, so a host/agent can reason about trust and
 * gate dangerous capabilities. A tool with no declared effects is
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
	/**
	 * Optional i18n key the documentation site (apps/web) resolves against
	 * `apps/web/src/i18n/tools/<key>.ts`. The runtime `description` passed
	 * to the MCP SDK is always the English string (it must be — the SDK
	 * rejects anything else); this key only affects how the docs site
	 * renders the description in non-English locales. Keeping it on the
	 * registration (vs. on the MCP `description`) preserves the MCP
	 * contract and lets tools opt in incrementally.
	 *
	 * Convention: namespace-qualified (`<plugin>_<tool>`), e.g.
	 * `mcp-vertex_proposals_auto_work`. Underscore-separated; matches the
	 * `IToolI18n` catalogue layout.
	 */
	readonly descriptionKey?: string | undefined;
	/** Optional grouping tags, e.g. `['coordination']`, `['lazy']`. */
	readonly tags?: readonly string[] | undefined;
	/**
	 * Side effects this tool can have. Omit for read-only tools. Surfaced
	 * by `overview` so a host can warn on / gate write/spawn/destructive tools.
	 */
	readonly effects?: readonly IToolEffect[] | undefined;
	/**
	 * f00189 (Track F / security): when `true`, the tool honours
	 * the transversal `dryRun` protocol — accepts `args.dryRun`
	 * and returns an `IDryRunResult` instead of executing side
	 * effects. Tools with `effects` other than `[]` MUST set
	 * this to `true`; the manifest loader emits a warning at
	 * boot when the flag is missing.
	 */
	readonly dryRunSupported?: boolean | undefined;
	/**
	 * When present, the registration is for a tool that has been deprecated
	 * (f00057 S11): the registration's handler still runs but must return a
	 * `{ ok: false, error: { reason: 'deprecated', replacement, since } }`
	 * envelope with `isError: true` so any caller learns the deprecation
	 * before the tool is removed in a follow-up release.
	 *
	 * Hosts that surface tool metadata (the docs site, `mcp-vertex_overview`)
	 * read this marker and render a strikethrough + replacement link instead
	 * of treating the tool as a first-class entry. The replacement is the
	 * unprefixed `id` of the recommended substitute (e.g. `search_search`); a
	 * caller passes `replacementArgs` to it as-is.
	 *
	 * Contract additive — existing registrations stay valid (the field is
	 * optional). Removal of a deprecated tool is a separate proposal that
	 * follows the standard slice flow.
	 */
	readonly deprecated?: IToolDeprecationMarker | undefined;
	/**
	 * f00154 S3 — when `true`, the core skips the
	 * `withIncidentLogging` wrapper for this tool. The default is
	 * `false` (every tool's errors are incident-logged). Escape hatch
	 * for tools that intentionally return failure as part of their
	 * contract (e.g. `redact_test`, `proposals_locate`) and would
	 * otherwise flood the curated error stream.
	 */
	readonly incidentLoggingDisabled?: boolean | undefined;
	/**
	 * f00154 S3 — per-tool `incidentType` override. When the tool
	 * fails, the emitted incident carries this code instead of the
	 * generic `tool-failure`. Plugin authors set this once per
	 * registration to give `logs_incidents` a per-plugin signature.
	 */
	readonly incidentType?: string | undefined;
	/**
	 * Progressive-disclosure hint for `native`-mode
	 * `tools/list`. Strictly opt-in and backwards compatible — a
	 * registration that declares nothing (the default for every existing
	 * tool) stays `visible`, exactly as before this field existed.
	 *
	 * - omitted / `'essential'` — listed in `tools/list` (unchanged
	 *   behaviour).
	 * - `'contextual'` / `'administrative'` — NOT listed in `native`-mode
	 *   `tools/list`, but the tool is otherwise untouched: still
	 *   registered, still authorized, still reachable through the
	 *   router (`invokeTool`/`resolveRoute`) and discoverable via
	 *   `searchTools`. This is the `hidden` access state
	 *   (`IToolAccessState` in `tool-surface.interface.ts`), never
	 *   `deactivated` — the tool costs no `tools/list` bytes until an
	 *   agent asks for it, but nothing about calling it changes.
	 */
	readonly disclosure?: TToolDisclosureLevel | undefined;
	register(server: McpServer): Promise<void>;
}

/**
 * f00057 S11: metadata for a deprecated tool registration. The handler
 * must still return a typed envelope so the deprecation is enforced at
 * runtime; this marker is the static metadata that surfaces in
 * overviews, docs sites and IDE renderings.
 */
export interface IToolDeprecationMarker {
	/** First release that ships the deprecation (e.g. `0.x.y`). */
	readonly since: string;
	/** Unprefixed id of the recommended replacement tool. */
	readonly replacement: string;
	/** Argument shape to pass to the replacement. Omit when none. */
	readonly replacementArgs?: Readonly<Record<string, unknown>> | undefined;
	/** Optional free-form note shown in docs and the runtime envelope. */
	readonly note?: string | undefined;
}

export interface IPromptRegistration {
	readonly id: string;
	register(server: McpServer): Promise<void>;
}

export interface IResourceRegistration {
	readonly id: string;
	register(server: McpServer): Promise<void>;
}
