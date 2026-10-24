import { describe, expect, it } from 'vitest';
import z from 'zod';

import { stripWireJsonSchemaNoise } from '@delendai/core/lib/surface/wire-json-schema.helper';

describe('stripWireJsonSchemaNoise', () => {
	it('drops the dialect marker and implicit safe-integer bounds at every depth', () => {
		const schema = z
			.object({
				count: z.number().int().nonnegative(),
				offset: z.number().int(),
				rows: z.array(z.object({ order: z.number().int().positive() })),
			})
			.toJSONSchema();

		const stripped = JSON.stringify(stripWireJsonSchemaNoise(schema));

		expect(JSON.stringify(schema)).toContain('$schema');
		expect(JSON.stringify(schema)).toContain('9007199254740991');
		expect(stripped).not.toContain('$schema');
		expect(stripped).not.toContain('9007199254740991');
	});

	it('keeps every constraint that is contract', () => {
		const schema = z
			.object({
				ratio: z.number().min(0).max(1),
				kind: z.enum(['a', 'b']),
				order: z.number().int().positive(),
			})
			.toJSONSchema();

		expect(stripWireJsonSchemaNoise(schema)).toEqual({
			type: 'object',
			properties: {
				ratio: { type: 'number', minimum: 0, maximum: 1 },
				kind: { type: 'string', enum: ['a', 'b'] },
				order: { type: 'integer', exclusiveMinimum: 0 },
			},
			required: ['ratio', 'kind', 'order'],
			additionalProperties: false,
		});
	});

	it('treats property names as data, not keywords', () => {
		const schema = {
			type: 'object',
			properties: {
				$schema: { type: 'string' },
				maximum: { type: 'integer', maximum: Number.MAX_SAFE_INTEGER },
			},
		};

		expect(stripWireJsonSchemaNoise(schema)).toEqual({
			type: 'object',
			properties: {
				$schema: { type: 'string' },
				maximum: { type: 'integer' },
			},
		});
	});

	it('does not mutate its argument and passes non-objects through', () => {
		const schema = { $schema: 'x', type: 'object' };
		stripWireJsonSchemaNoise(schema);
		expect(schema).toEqual({ $schema: 'x', type: 'object' });
		expect(stripWireJsonSchemaNoise(undefined)).toBeUndefined();
		expect(stripWireJsonSchemaNoise('text')).toBe('text');
	});
});
