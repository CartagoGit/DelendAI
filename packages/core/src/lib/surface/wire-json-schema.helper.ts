// wire-json-schema: drop the bytes a JSON Schema carries on the `tools/list`
// wire that tell a client nothing it does not already assume.
//
// Measured on the `standard` preset (107 tools, 134,561 B): Zod 4's
// `toJSONSchema` stamps every input and output schema with
// `"$schema":"http://json-schema.org/draft-07/schema#"` (10,608 B) and
// bounds every `z.number().int()` with `±9007199254740991` (2,730 B) —
// together ~10% of the preset, repeated once per tool.
//
// Neither changes what a client accepts:
//  - MCP clients validate `structuredContent` with their own validator
//    (the SDK's Ajv instance defaults to draft-07), so the dialect marker
//    restates the default.
//  - `Number.MAX_SAFE_INTEGER` is the bound of every integer a JSON
//    producer in this runtime can emit exactly; declaring it rejects
//    nothing the server can send.
//
// Everything else — `additionalProperties: false`, `required`, enums,
// real bounds — is contract and stays byte-for-byte.

const SAFE_INTEGER_BOUNDS: Readonly<Record<string, number>> = {
	maximum: Number.MAX_SAFE_INTEGER,
	minimum: -Number.MAX_SAFE_INTEGER,
};

const isWireNoise = (key: string, value: unknown): boolean =>
	key === '$schema' || SAFE_INTEGER_BOUNDS[key] === value;

/**
 * Returns a copy of `schema` without the dialect marker and the implicit
 * safe-integer bounds, at every depth. Non-object input comes back as is.
 * Pure: the argument is never mutated.
 */
export const stripWireJsonSchemaNoise = (schema: unknown): unknown => {
	if (Array.isArray(schema)) return schema.map(stripWireJsonSchemaNoise);
	if (schema === null || typeof schema !== 'object') return schema;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		// `properties` maps user field names to schemas: a field literally
		// named `$schema` or `maximum` is data, not a keyword.
		if (
			key === 'properties' &&
			value !== null &&
			typeof value === 'object'
		) {
			result[key] = Object.fromEntries(
				Object.entries(value).map(([name, child]) => [
					name,
					stripWireJsonSchemaNoise(child),
				]),
			);
			continue;
		}
		if (isWireNoise(key, value)) continue;
		result[key] = stripWireJsonSchemaNoise(value);
	}
	return result;
};
