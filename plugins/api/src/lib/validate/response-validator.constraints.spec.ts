import { describe, expect, it } from 'vitest';

import { parseOpenApi } from '../spec/openapi';
import type { IOpenApiOperation } from '../spec/openapi';

import { validateResponse } from './response-validator';

describe('validation keeps the constraints of the parsed spec', () => {
	const operationFor = (schema: unknown): IOpenApiOperation => {
		const operation = parseOpenApi({
			paths: {
				'/x': {
					get: {
						operationId: 'x',
						responses: {
							'200': {
								description: 'ok',
								content: { 'application/json': { schema } },
							},
						},
					},
				},
			},
		}).operations.x;
		if (operation === undefined)
			throw new Error('fixture has no operation');
		return operation;
	};
	const rulesOf = (schema: unknown, value: unknown) =>
		validateResponse(operationFor(schema), value).map((f) => f.ruleId);

	it('accepts null only on a nullable schema', () => {
		const schema = { type: 'string', enum: ['a'] };
		expect(rulesOf({ ...schema, nullable: true }, null)).toEqual([]);
		expect(rulesOf(schema, null)).toEqual(['type-mismatch']);
	});

	it('enforces enum, numeric and exclusive bounds', () => {
		expect(rulesOf({ enum: ['a'] }, 'b')).toEqual(['enum-out-of-range']);
		const bounded = { type: 'integer', minimum: 1, maximum: 3 };
		expect(rulesOf(bounded, 0)).toEqual(['out-of-bounds']);
		expect(rulesOf(bounded, 4)).toEqual(['out-of-bounds']);
		expect(rulesOf(bounded, 2)).toEqual([]);
		const open = {
			type: 'number',
			minimum: 1,
			exclusiveMinimum: true,
			maximum: 3,
			exclusiveMaximum: true,
		};
		expect(rulesOf(open, 1)).toEqual(['out-of-bounds']);
		expect(rulesOf(open, 3)).toEqual(['out-of-bounds']);
		expect(rulesOf(open, 2)).toEqual([]);
	});

	it('enforces string and array lengths', () => {
		const text = { type: 'string', minLength: 2, maxLength: 3 };
		expect(rulesOf(text, 'a')).toEqual(['out-of-bounds']);
		expect(rulesOf(text, 'abcd')).toEqual(['out-of-bounds']);
		const list = { type: 'array', minItems: 1, maxItems: 2 };
		expect(rulesOf(list, [])).toEqual(['out-of-bounds']);
		expect(rulesOf(list, [1, 2, 3])).toEqual(['out-of-bounds']);
		expect(rulesOf(list, [1])).toEqual([]);
	});

	it('refuses a union instead of passing it', () => {
		expect(() => rulesOf({ oneOf: [{ type: 'string' }] }, 1)).toThrow(
			/unsupported-schema-feature/,
		);
	});

	it('rejects extra properties on a closed object', () => {
		expect(
			rulesOf(
				{ type: 'object', additionalProperties: false },
				{ extra: 1 },
			),
		).toEqual(['extra-property']);
	});
});
