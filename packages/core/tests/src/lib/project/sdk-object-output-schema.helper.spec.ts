/**
 * sdk-object-output-schema.helper.spec.ts — a union of objects becomes one
 * object that accepts every member's answers.
 */
import { describe, expect, it } from 'vitest';
import z from 'zod';

import { sdkObjectOutputSchema } from '@delendai/core/lib/project/sdk-object-output-schema.helper';

describe('sdkObjectOutputSchema', () => {
	it('leaves an object, a missing schema and a union with a non-object member as they are', () => {
		const object = z.object({ ok: z.boolean() });
		const mixed = z.union([object, z.string()]);
		expect(sdkObjectOutputSchema(object)).toBe(object);
		expect(sdkObjectOutputSchema(undefined)).toBeUndefined();
		expect(sdkObjectOutputSchema(mixed)).toBe(mixed);
	});

	it('merges members, nested unions included, into an object that accepts each', () => {
		const merged = sdkObjectOutputSchema(
			z.union([
				z.object({ ok: z.literal(true), count: z.number() }),
				z.union([
					z.object({ ok: z.literal(false), reason: z.string() }),
					z.object({ ok: z.literal(false), count: z.string() }),
				]),
			]),
		) as z.ZodType;
		expect(merged).toBeInstanceOf(z.ZodObject);
		for (const answer of [
			{ ok: true, count: 2 },
			{ ok: false, reason: 'r' },
			{ ok: false, count: 'two' },
		])
			expect(merged.safeParse(answer).success).toBe(true);
	});

	it('requires a field only when every member requires it', () => {
		const merged = sdkObjectOutputSchema(
			z.union([
				z.object({ ok: z.literal(true), count: z.number().optional() }),
				z.object({ ok: z.literal(false), count: z.number() }),
			]),
		) as z.ZodType;
		expect(merged.safeParse({ count: 1 }).success).toBe(false);
		expect(merged.safeParse({ ok: true }).success).toBe(true);
	});
});
