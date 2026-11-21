/**
 * sdk-object-output-schema.helper.ts — an output schema the MCP SDK can use.
 *
 * The SDK takes an object schema (or a raw shape) as a tool's
 * outputSchema. Given a union it advertises no schema at all, then fails
 * the call validating against it (`undefined is not an object (evaluating
 * 's._zod')`): a valid answer reached the client as an error. A union of
 * objects is therefore registered as one object holding every member's
 * fields, each optional unless every member requires it, and a field two
 * members type differently as the union of those types. Every answer a
 * member accepts, the merged object accepts.
 */

import z from 'zod';

type IZodObjectLike = z.ZodObject<z.ZodRawShape>;

/** The members of a union, nested unions flattened; `undefined` if `schema` is no union. */
const unionMembers = (schema: unknown): readonly unknown[] | undefined => {
	if (!(schema instanceof z.ZodUnion)) return undefined;
	return (schema.options as readonly unknown[]).flatMap(
		(option) => unionMembers(option) ?? [option],
	);
};

const acceptsUndefined = (field: z.ZodType): boolean =>
	field.safeParse(undefined).success;

/**
 * `schema` as an object the SDK can advertise and validate against, or
 * `schema` unchanged when it already is one, is no schema, or is a union
 * with a member that is not an object.
 */
export const sdkObjectOutputSchema = (schema: unknown): unknown => {
	const members = unionMembers(schema);
	if (members === undefined) return schema;
	if (!members.every((member) => member instanceof z.ZodObject))
		return schema;
	const objects = members as readonly IZodObjectLike[];
	const fields = new Map<string, z.ZodType[]>();
	for (const object of objects)
		for (const [key, field] of Object.entries(object.shape))
			fields.set(key, [...(fields.get(key) ?? []), field as z.ZodType]);
	const shape: Record<string, z.ZodType> = {};
	for (const [key, types] of fields) {
		// One type per distinct JSON Schema: `url: z.string()` in three
		// members is a string, not an anyOf of three strings.
		const distinct = [
			...new Map(
				types.map((type) => [
					JSON.stringify(z.toJSONSchema(type)),
					type,
				]),
			).values(),
		];
		const merged =
			distinct.length === 1
				? (distinct[0] as z.ZodType)
				: z.union(distinct as [z.ZodType, z.ZodType, ...z.ZodType[]]);
		const required =
			types.length === objects.length &&
			!types.some((type) => acceptsUndefined(type));
		shape[key] = required ? merged : merged.optional();
	}
	return z.object(shape);
};
