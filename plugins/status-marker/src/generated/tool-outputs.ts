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

export interface StatusMarkerCloseOutput {
	ok: true;
	state: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
	reason?: string;
	line: string;
}

export interface StatusMarkerPingOutput {
	plugin: "status-marker";
	cacheDir: string;
	docsDir: string;
}

export type StatusMarkerValidateOutput = {
	ok: true;
	state: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
	reason?: string;
	line: string;
} | {
	ok: false;
	state?: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
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
