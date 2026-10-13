/**
 * tool-component-breakdown.helper.ts
 *
 * Decomposes one real MCP `tools/list` wire entry into the byte components
 * that actually make it up: `name`, `description`, `inputSchema`,
 * `outputSchema`, `annotations`, any other field the SDK might attach, and
 * the JSON envelope (key labels, quotes, colons, commas, braces) around all
 * of them. This mirrors the exact serialization
 * `ToolSurfaceRuntimeService.measureSchemaBytes` builds in
 * `packages/core/src/lib/project/tool-surface-runtime.service.ts`
 * (`{ name, description, inputSchema, outputSchema? }`, JSON-stringified),
 * except it reads the components straight off the real object the client
 * receives, so it also accounts for `annotations` or any future field
 * without needing a second, drift-prone reconstruction.
 *
 * The five named components plus `otherFieldBytes` plus `envelopeBytes`
 * always sum to `totalBytes` exactly — `envelopeBytes` is derived by
 * subtraction (`totalBytes` minus every field's own JSON-encoded byte
 * length), never estimated.
 */
export declare const jsonBytes: (value: unknown) => number;
export interface IToolComponentBytes {
	readonly name: string;
	readonly nameBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	/** Any wire field beyond the five named ones above; 0 today. */
	readonly otherFieldBytes: number;
	/** JSON punctuation and key labels: totalBytes minus every field's value bytes. */
	readonly envelopeBytes: number;
	readonly totalBytes: number;
}
export declare const measureToolComponentBytes: (
	tool: Readonly<Record<string, unknown>>,
) => IToolComponentBytes;
