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

export interface McpVertexStatusMarkerCloseOutput {
	ok: true;
	state: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
	reason?: string;
	locale?: "es" | "en";
	line: string;
}

export interface McpVertexStatusMarkerPingOutput {
	plugin: "status-marker";
	cacheDir: string;
	docsDir: string;
	markers?: {
		userDefined: {
			state: string;
			emoji: string;
			requiresReason: boolean;
			instruction?: string;
		}[];
	};
}

export type McpVertexStatusMarkerValidateOutput = {
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
	"mcp-vertex_status-marker_close": McpVertexStatusMarkerCloseOutput;
	"mcp-vertex_status-marker_ping": McpVertexStatusMarkerPingOutput;
	"mcp-vertex_status-marker_validate": McpVertexStatusMarkerValidateOutput;
}
