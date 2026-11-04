/**
 * `parseInputSchema` — turn a JSON Schema object (the shape MCP's
 * `listTools().tools[].inputSchema` returns for a tool that declared its
 * input via Zod) into a flat list of fields the docs site can render as an
 * arguments table.
 *
 * The output is intentionally conservative: we extract only what the table
 * needs (name, type, required, description) and leave everything else
 * untouched. Defensive parsing: any non-object input, missing `properties`,
 * or `additionalProperties`-only schema returns `undefined` (not an empty
 * array — callers can distinguish "no schema" from "schema with no fields").
 *
 * Why a separate file: the MCP SDK might evolve its serialization, and the
 * docs site should be able to evolve its parser without touching
 * `gen-capabilities.ts`. Single responsibility, pure function, fully
 * tested. The shape itself is documented inline so future maintainers do
 * not have to read MCP SDK source to understand it.
 */

export interface IInputSchemaField {
	readonly name: string;
	/** Short, human-readable type label (e.g. `"string"`, `"number"`, `"boolean"`, `"object"`). */
	readonly type: string;
	readonly required: boolean;
	readonly description?: string;
}

export interface IParsedInputSchema {
	readonly fields: readonly IInputSchemaField[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const typeOf = (propSchema: unknown): string => {
	if (!isPlainObject(propSchema)) return 'unknown';
	const t = propSchema.type;
	if (typeof t === 'string') return t;
	// Union types (`type: ['string','null']`) → first non-null.
	if (Array.isArray(t)) {
		const nonNull = t.find((x) => x !== 'null');
		return typeof nonNull === 'string' ? nonNull : 'unknown';
	}
	return 'unknown';
};

/**
 * Parse an MCP `inputSchema` payload into a flat field list.
 *
 * Returns `undefined` when the payload is missing, not an object, or has
 * no `properties` (the canonical "no schema declared" case). Returns an
 * empty `{ fields: [] }` only when `properties` is an empty object — which
 * is rare but technically valid (a tool that accepts no args).
 */
export const parseInputSchema = (
	schema: unknown,
): IParsedInputSchema | undefined => {
	if (!isPlainObject(schema)) return undefined;
	const properties = schema.properties;
	if (properties === undefined) return undefined;
	if (!isPlainObject(properties)) return undefined;
	const requiredList = Array.isArray(schema.required)
		? (schema.required as unknown[]).filter(
				(x): x is string => typeof x === 'string',
			)
		: [];
	const required = new Set(requiredList);

	const fields: IInputSchemaField[] = [];
	for (const [name, propSchema] of Object.entries(properties)) {
		const field: IInputSchemaField = {
			name,
			type: typeOf(propSchema),
			required: required.has(name),
		};
		if (
			isPlainObject(propSchema) &&
			typeof propSchema.description === 'string'
		) {
			(field as { description?: string }).description =
				propSchema.description;
		}
		fields.push(field);
	}
	// Stable order: required first, then alphabetical. Matches the convention
	// most API doc sites use (Stripe, GitHub, OpenAI).
	fields.sort((a, b) => {
		if (a.required !== b.required) return a.required ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	return { fields };
};
