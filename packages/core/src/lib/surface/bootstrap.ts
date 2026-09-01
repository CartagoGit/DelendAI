/**
 * AUD-B04 — the single place "tool wire bytes" is computed.
 *
 * Before this, three unrelated shapes each claimed to measure "tool
 * bytes" and none of them matched what a client actually receives from
 * `tools/list` (`{name, description, inputSchema, outputSchema,
 * annotations}`):
 *
 *  - `measureBootstrapBytes` (this file) serialised
 *    `{name, toolId, summary}` — `toolId`/`summary` are not even real
 *    MCP fields, and `inputSchema`/`outputSchema` were entirely absent,
 *    so a growing `outputSchema` (75% of real bootstrap cost per the
 *    audit) could never move this number.
 *  - `ToolSurfaceRuntime.measureSchemaBytes` serialised a
 *    `compactDescription`-truncated description no real `tools/list`
 *    response ever sends (compaction is a display concern for
 *    `overview`/`tool_search`, not what the SDK actually registers).
 *  - `measureToolTextBytes` (`tools/scripts/report`) measures a tool
 *    CALL's response text — a different payload than a tool
 *    *definition*, kept separate on purpose (see its own doc comment).
 *
 * `measureToolWireBytes` below mirrors the MCP SDK's own
 * `ListToolsRequestSchema` handler
 * (`@modelcontextprotocol/sdk/server/mcp.js`) field-for-field: a tool
 * definition always carries `inputSchema` (defaulting to the same
 * empty-object JSON Schema the SDK falls back to when none is
 * declared), and includes `description` / `outputSchema` /
 * `annotations` only when defined — exactly the fields `JSON.stringify`
 * would keep from a real `tools/list` entry, no more and no less.
 */
import type { IMcpToolWireDefinition } from '../contracts/interfaces/tool-wire.interface';

export type { IMcpToolWireDefinition };

export interface IBootstrapMeasurement {
	readonly tools: number;
	readonly bytes: number;
	readonly estimatedTokens: number;
}

/**
 * Same fallback the SDK uses (`EMPTY_OBJECT_JSON_SCHEMA` in
 * `server/mcp.js`) when a tool declares no input schema — a real
 * `tools/list` entry is never actually sent with a missing
 * `inputSchema`, so the measurement must not treat "no schema" as "no
 * bytes" either.
 */
const EMPTY_OBJECT_JSON_SCHEMA = { type: 'object', properties: {} } as const;

/**
 * Serialise exactly what one tool costs on the wire. This is the ONE
 * shared basis `measureBootstrapBytes` (below) and
 * `ToolSurfaceRuntime.measureSchemaBytes` both call — no other function
 * in this repo re-implements this shape.
 */
export const measureToolWireBytes = (tool: IMcpToolWireDefinition): number => {
	const definition: Record<string, unknown> = { name: tool.name };
	if (tool.description !== undefined) {
		definition.description = tool.description;
	}
	definition.inputSchema = tool.inputSchema ?? EMPTY_OBJECT_JSON_SCHEMA;
	if (tool.annotations !== undefined) {
		definition.annotations = tool.annotations;
	}
	if (tool.outputSchema !== undefined) {
		definition.outputSchema = tool.outputSchema;
	}
	if (tool.execution !== undefined) {
		definition.execution = tool.execution;
	}
	return Buffer.byteLength(JSON.stringify(definition), 'utf8');
};

/**
 * Aggregate `measureToolWireBytes` over a real `tools/list`-shaped
 * array. The bootstrap gate's measurement is now literally "sum the
 * wire bytes of the tools a client actually receives" — callers are
 * expected to pass the genuine result of a `tools/list` call (or, at
 * minimum, definitions built from the same registered
 * inputSchema/outputSchema a live server would serialise), never a
 * bookkeeping projection of it. See `tools/scripts/measure/bootstrap.script.ts`
 * for the CI job that drives a real in-memory connection to get one.
 */
export const measureBootstrapBytes = (
	tools: readonly IMcpToolWireDefinition[],
): IBootstrapMeasurement => {
	const bytes = tools.reduce(
		(sum, tool) => sum + measureToolWireBytes(tool),
		0,
	);
	return {
		tools: tools.length,
		bytes,
		estimatedTokens: Math.ceil(bytes / 4),
	};
};
