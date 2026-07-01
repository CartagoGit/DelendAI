/**
 * GENERATED FILE — but see note below.
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
 *
 * --- User-configurable marker set (proposal f00071) ---
 *
 * The wire `state` enum grows additively when a host declares
 * `plugins.status-marker.options.markers.add`. The built-in 8 states stay
 * listed verbatim (so they still autocomplete), and `(string & {})` admits
 * host-declared states without forcing a regenerate per host config. The 8
 * built-ins are the floor; user states are the open tail.
 *
 * --- Status-marker harvest gap (proposal f00070, S4 follow-up) ---
 *
 * The harvester in `tools/scripts/types/generate-tool-types.script.ts`
 * does not currently register `status-marker` tools (`_registeredTools`
 * ends up empty for this package). As a result `bun run types:generate`
 * never writes this file from scratch, so the runtime Zod schema and
 * the typed envelope here were drifted out of lock-step by hand.
 *
 * Until the harvest gap is closed, the rule for this file is:
 *
 *   - DO regenerate after every Zod schema change: `bun run types:generate`.
 *     The script is idempotent w.r.t. this file (writes nothing here
 *     today), so the hand-edited contents are preserved verbatim.
 *   - DO hand-edit this file when adding a new `outputSchema` field.
 *     The next harvest that picks up this plugin will overwrite your
 *     hand-edit with the regenerated content, which is exactly what
 *     you want.
 *   - DO file a follow-up to fix the harvest wiring. Until then, treat
 *     this banner as "best-effort generated".
 */

/**
 * Built-in close-marker states. Hosts may extend this set additively via
 * `plugins.status-marker.options.markers.add` (proposal f00071); the open
 * tail `(string & {})` on the wire `state` field admits those.
 */
export type StatusMarkerBuiltinState = "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";

/** Wire `state`: a built-in or a host-declared marker id. */
export type StatusMarkerState = StatusMarkerBuiltinState | (string & {});

export interface StatusMarkerCloseOutput {
	ok: true;
	state: StatusMarkerState;
	reason?: string;
	/**
	 * Locale the rendered `line` was emitted with. Default is `'es'`
	 * (legacy canonical state name); `'en'` renders shorter English
	 * tokens. See proposal `f00070` for rationale.
	 */
	locale?: "es" | "en";
	line: string;
}

/** One host-declared marker surfaced by `<prefix>_ping` (proposal f00071). */
export interface StatusMarkerUserDefinedMarker {
	state: string;
	emoji: string;
	requiresReason: boolean;
	instruction?: string;
}

export interface StatusMarkerPingOutput {
	plugin: "status-marker";
	cacheDir: string;
	docsDir: string;
	/** Present only when the host declared `markers.add` entries. */
	markers?: {
		userDefined: StatusMarkerUserDefinedMarker[];
	};
}

export type StatusMarkerValidateOutput = {
	ok: true;
	state: StatusMarkerState;
	reason?: string;
	line: string;
} | {
	ok: false;
	state?: StatusMarkerState;
	reason?: string;
	line?: string;
	violation?: string;
	violations?: string[];
};

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface StatusMarkerToolOutputs {
	"status-marker_close": StatusMarkerCloseOutput;
	"status-marker_ping": StatusMarkerPingOutput;
	"status-marker_validate": StatusMarkerValidateOutput;
}
