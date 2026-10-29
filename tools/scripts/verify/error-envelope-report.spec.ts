/**
 * error-envelope-report.spec.ts — which schemas model the error envelope,
 * and how many per plugin do not.
 */
import { describe, expect, it } from 'vitest';
import z from 'zod';

import { unmodelledByPlugin } from './error-envelope-report';
import { modelsErrorEnvelope } from './verify-probes';

describe('modelsErrorEnvelope', () => {
	it('is false for a success-only schema, the shape a listing client would reject', () => {
		expect(
			modelsErrorEnvelope(
				z.object({ ok: z.literal(true), count: z.number() }),
			),
		).toBe(false);
	});

	it('is true for a schema that admits the error envelope toolError sends', () => {
		expect(
			modelsErrorEnvelope(
				z.object({
					ok: z.boolean(),
					count: z.number().optional(),
					error: z
						.object({
							code: z.string().optional(),
							reason: z.string(),
							nextAction: z.string().optional(),
						})
						.optional(),
				}),
			),
		).toBe(true);
	});

	it('is true when there is no schema to model it', () => {
		expect(modelsErrorEnvelope(undefined)).toBe(true);
	});
});

describe('unmodelledByPlugin', () => {
	it('counts per plugin, most first', () => {
		expect(
			unmodelledByPlugin([
				{ plugin: 'git', tool: 'x' },
				{ plugin: 'memory', tool: 'y' },
				{ plugin: 'memory', tool: 'z' },
			]),
		).toEqual([
			{ plugin: 'memory', count: 2 },
			{ plugin: 'git', count: 1 },
		]);
	});
});
