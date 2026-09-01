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

export const jsonBytes = (value: unknown): number => {
	if (value === undefined) return 0;
	return Buffer.byteLength(JSON.stringify(value), 'utf8');
};

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

const KNOWN_COMPONENT_KEYS = [
	'name',
	'description',
	'inputSchema',
	'outputSchema',
	'annotations',
] as const;

export const measureToolComponentBytes = (
	tool: Readonly<Record<string, unknown>>,
): IToolComponentBytes => {
	const totalBytes = jsonBytes(tool);
	const knownValueBytes = KNOWN_COMPONENT_KEYS.reduce(
		(sum, key) => sum + jsonBytes(tool[key]),
		0,
	);
	const allValueBytes = Object.keys(tool).reduce(
		(sum, key) => sum + jsonBytes(tool[key]),
		0,
	);
	const name = typeof tool.name === 'string' ? tool.name : '';
	return {
		name,
		nameBytes: jsonBytes(tool.name),
		descriptionBytes: jsonBytes(tool.description),
		inputSchemaBytes: jsonBytes(tool.inputSchema),
		outputSchemaBytes: jsonBytes(tool.outputSchema),
		annotationsBytes: jsonBytes(tool.annotations),
		otherFieldBytes: allValueBytes - knownValueBytes,
		envelopeBytes: totalBytes - allValueBytes,
		totalBytes,
	};
};
