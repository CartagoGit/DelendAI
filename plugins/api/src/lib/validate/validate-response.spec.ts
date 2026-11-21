import { describe, expect, it, vi } from 'vitest';

import type { IOpenApiOperation } from '../spec/openapi';

import { validateResponse } from './validate-response';

const OPERATION: IOpenApiOperation = {
	operationId: 'getUser',
	method: 'GET',
	path: '/users/{id}',
	parameters: [],
	tags: ['users'],
	responses: [
		{
			status: '200',
			description: 'OK',
			contentType: 'application/json',
			schema: {
				type: 'object',
				required: ['id', 'name', 'meta'],
				properties: {
					id: { type: 'integer' },
					name: { type: 'string' },
					meta: {
						type: 'object',
						required: ['active'],
						properties: {
							active: { type: 'boolean' },
						},
					},
				},
			},
		},
		{
			status: '201',
			description: 'Created',
			contentType: 'application/json',
			schema: {
				type: 'object',
				required: ['created'],
				properties: { created: { type: 'boolean' } },
			},
		},
	],
};

describe('validateResponse', () => {
	it('returns a clean summary for a matching response', () => {
		const result = validateResponse(OPERATION, {
			id: 1,
			name: 'Alice',
			meta: { active: true },
		});
		expect(result.mismatches).toEqual([]);
		expect(result.summary.critical).toBe(0);
		expect(result.worst).toBe('none');
	});

	it('parses stringified JSON before validating', () => {
		const result = validateResponse(
			OPERATION,
			JSON.stringify({ id: 1, name: 'Alice', meta: { active: true } }),
		);
		expect(result.mismatches).toHaveLength(0);
	});

	it('reports missing required fields, extra fields and type mismatches', () => {
		const result = validateResponse(OPERATION, {
			id: '1',
			meta: { active: true },
			extra: true,
		});
		expect(result.summary.critical).toBe(1);
		expect(result.summary.high).toBe(1);
		expect(result.summary.medium).toBe(1);
		expect(result.worst).toBe('critical');
	});

	it('emits a single critical root type mismatch for null object bodies', () => {
		const result = validateResponse(OPERATION, null);
		expect(result.mismatches).toHaveLength(1);
		expect(result.mismatches[0]?.ruleId).toBe('type-mismatch');
		expect(result.mismatches[0]?.severity).toBe('critical');
		expect(result.mismatches[0]?.message).toContain('$.');
	});

	it('uses the requested status code schema', () => {
		const result = validateResponse(OPERATION, { created: false }, 201);
		expect(result.mismatches).toHaveLength(0);
	});

	it('supports injected summary deps', () => {
		const summarizeFindings = vi.fn(() => ({
			critical: 9,
			high: 8,
			medium: 7,
			low: 6,
			info: 5,
		}));
		const worstSeverity = vi.fn(() => 'high' as const);
		const result = validateResponse(OPERATION, {}, 200, {
			summarizeFindings,
			worstSeverity,
		});
		expect(result.summary.high).toBe(8);
		expect(result.worst).toBe('high');
		expect(summarizeFindings).toHaveBeenCalledTimes(1);
	});
});
