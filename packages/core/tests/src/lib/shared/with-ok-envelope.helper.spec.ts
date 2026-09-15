/**
 * with-ok-envelope.helper.spec.ts — a `toolOk` answer must satisfy the
 * schema a listing client enforces, which rejects undeclared keys.
 */
import { describe, expect, it } from 'vitest';
import z from 'zod';

import { toolOk } from '@delendai/core/lib/shared/tool-response';
import { withOkEnvelope } from '@delendai/core/lib/shared/with-ok-envelope.helper';

const payloadSchema = z.object({
	status: z.enum(['ok', 'rejected']),
	count: z.number().int().nonnegative(),
});

const structuredOf = (data: z.infer<typeof payloadSchema>) =>
	toolOk(data).structuredContent;

describe('withOkEnvelope', () => {
	it('accepts a toolOk answer when undeclared keys are forbidden', () => {
		const wire = withOkEnvelope(payloadSchema).strict();

		expect(
			wire.safeParse(structuredOf({ status: 'ok', count: 2 })).success,
		).toBe(true);
	});

	it('is what the bare payload schema was missing', () => {
		// The shape of the defect: the payload schema alone, held to the
		// same rule a listing client applies, refuses the `ok` toolOk adds.
		expect(
			payloadSchema
				.strict()
				.safeParse(structuredOf({ status: 'ok', count: 2 })).success,
		).toBe(false);
	});

	it('declares ok as true, so an error envelope is never mistaken for a success', () => {
		const wire = withOkEnvelope(payloadSchema);

		expect(
			wire.safeParse({ ok: false, status: 'ok', count: 2 }).success,
		).toBe(false);
	});

	it('advertises ok in the JSON schema a client receives', () => {
		const json = z.toJSONSchema(withOkEnvelope(payloadSchema)) as {
			readonly properties: Record<string, unknown>;
			readonly required: readonly string[];
		};

		expect(json.properties).toHaveProperty('ok');
		expect(json.required).toContain('ok');
	});
});
