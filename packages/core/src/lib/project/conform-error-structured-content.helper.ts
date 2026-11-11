/**
 * conform-error-structured-content.helper.ts — keep an error result's
 * `structuredContent` only when it conforms to the tool's output schema.
 *
 * The MCP SDK server skips output validation for `isError` results, but
 * the SDK client validates any `structuredContent` against the output
 * schema it learned from `tools/list`, error or not. A tool whose schema
 * describes its success payload therefore turned every `toolError` into
 * `-32602 Structured content does not match the tool's output schema` for
 * any client that listed tools first, and the caller lost the reason and
 * the next action.
 *
 * The text envelope always carries the full error, so dropping a
 * non-conforming `structuredContent` loses nothing. A tool whose schema
 * models its error envelope keeps it.
 *
 * Conformance mirrors the client, which rejects additional properties: a
 * value conforms when the schema accepts it without stripping any key.
 */

import z from 'zod';

import type { IOutputParser } from '../contracts/interfaces/output-parser.interface';

const isOutputParser = (value: unknown): value is IOutputParser =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { readonly safeParse?: unknown }).safeParse === 'function';

/**
 * The parser for a registered tool's `outputSchema`, normalised like the
 * SDK does: a schema as is, a raw shape of schemas as `z.object(shape)`,
 * anything else as no schema at all.
 */
export const resolveOutputParser = (
	outputSchema: unknown,
): IOutputParser | undefined => {
	if (isOutputParser(outputSchema)) return outputSchema;
	if (typeof outputSchema !== 'object' || outputSchema === null) {
		return undefined;
	}
	const fields = Object.values(outputSchema);
	if (fields.length === 0 || !fields.every(isOutputParser)) return undefined;
	return z.object(outputSchema as z.ZodRawShape);
};

/** JSON text with object keys sorted, so key order never decides equality. */
const canonical = (value: unknown): string =>
	JSON.stringify(value, (_key, inner: unknown) =>
		typeof inner === 'object' && inner !== null && !Array.isArray(inner)
			? Object.fromEntries(
					Object.entries(inner).sort(([left], [right]) =>
						left.localeCompare(right),
					),
				)
			: inner,
	);

/**
 * The result to put on the wire. Success results, errors without
 * structured content, and errors whose structured content conforms are
 * returned unchanged; otherwise a copy without `structuredContent`.
 */
export const conformErrorStructuredContent = (
	result: unknown,
	parser: IOutputParser | undefined,
): unknown => {
	if (parser === undefined || typeof result !== 'object' || result === null) {
		return result;
	}
	const { isError, structuredContent } = result as {
		readonly isError?: unknown;
		readonly structuredContent?: unknown;
	};
	if (isError !== true || structuredContent === undefined) return result;
	const parsed = parser.safeParse(structuredContent);
	if (
		parsed.success &&
		canonical(parsed.data) === canonical(structuredContent)
	) {
		return result;
	}
	return Object.fromEntries(
		Object.entries(result).filter(([key]) => key !== 'structuredContent'),
	);
};
