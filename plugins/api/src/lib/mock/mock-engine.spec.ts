/**
 * f00128 S3 — mock engine unit tests.
 *
 * Coverage:
 * - string formats (date-time, email, uuid, uri) emit the right shape.
 * - numeric ranges (min/max/exclusive) are honoured.
 * - arrays produce minItems..maxItems.
 * - objects always include required keys, optionally include optional ones.
 * - enum and explicit example are honoured first.
 * - the same options + seed produce the same output (deterministic).
 * - generateOperationMock returns one example per declared response.
 * - mockResponseForStatus / mockHappyPath select the right response.
 */
import { describe, expect, it } from 'vitest';

import type { IJsonSchema, IOpenApiOperation } from '../spec/openapi';

import {
	generateMockFromSchema,
	generateOperationMock,
	mockHappyPath,
	mockResponseForStatus,
} from './mock-engine';

const deterministicInt = (seed: number) => {
	let counter = seed;
	return () => {
		counter = (counter * 1664525 + 1013904223) >>> 0;
		return counter;
	};
};

describe('f00130 S3 mock-engine', () => {
	describe('generateMockFromSchema', () => {
		it('honours explicit example first', () => {
			const schema: IJsonSchema = { type: 'string', example: 'literal' };
			expect(
				generateMockFromSchema(
					schema,
					{ randomize: false },
					{ nextSeed: deterministicInt(1) },
				),
			).toBe('literal');
		});

		it('honours enum values', () => {
			const schema: IJsonSchema = {
				type: 'string',
				enum: ['a', 'b', 'c'],
			};
			const out = generateMockFromSchema(
				schema,
				{ randomize: false },
				{ nextSeed: deterministicInt(2) },
			);
			expect(out).toBe('a');
		});

		it('cycles enum deterministically when randomize is on', () => {
			const schema: IJsonSchema = {
				type: 'string',
				enum: ['a', 'b', 'c'],
			};
			const out = generateMockFromSchema(
				schema,
				{ randomize: true },
				{ nextSeed: deterministicInt(7) },
			);
			expect(typeof out).toBe('string');
			expect(['a', 'b', 'c']).toContain(out);
		});

		it('emits string formats (date-time, email, uuid, uri)', () => {
			const emitFormatted = (format: string): string => {
				const schema: IJsonSchema = { type: 'string', format };
				const out = generateMockFromSchema(
					schema,
					{ randomize: false },
					{ nextSeed: deterministicInt(1) },
				);
				return out as string;
			};
			expect(emitFormatted('date-time')).toBe('2024-01-01T00:00:00.000Z');
			expect(emitFormatted('date')).toBe('2024-01-01');
			expect(emitFormatted('email')).toMatch(/@example\.com/);
			expect(emitFormatted('uuid')).toBe(
				'00000000-0000-0000-0000-000000000000',
			);
			expect(emitFormatted('uri')).toMatch(/^https:\/\/example\.com\//);
		});

		it('honours numeric min/max', () => {
			const schema: IJsonSchema = {
				type: 'integer',
				minimum: 10,
				maximum: 12,
			};
			const out = generateMockFromSchema(
				schema,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			);
			expect(out).toBe(10);
		});

		it('falls inside the range when randomize is on', () => {
			const schema: IJsonSchema = {
				type: 'integer',
				minimum: 5,
				maximum: 8,
			};
			const out = generateMockFromSchema(
				schema,
				{ randomize: true },
				{ nextSeed: deterministicInt(4) },
			);
			expect(out).toBeGreaterThanOrEqual(5);
			expect(out).toBeLessThanOrEqual(8);
		});

		it('produces an array of the expected length', () => {
			const schema: IJsonSchema = {
				type: 'array',
				items: { type: 'integer' },
				minItems: 2,
				maxItems: 2,
			};
			const out = generateMockFromSchema(
				schema,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			) as number[];
			expect(out).toHaveLength(2);
			expect(out.every((n) => typeof n === 'number')).toBe(true);
		});

		it('always includes required object fields', () => {
			const schema: IJsonSchema = {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					name: { type: 'string' },
					optional: { type: 'boolean' },
				},
				required: ['id', 'name'],
			};
			const out = generateMockFromSchema(
				schema,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			) as Record<string, unknown>;
			expect(out).toHaveProperty('id');
			expect(out).toHaveProperty('name');
			expect(out).not.toHaveProperty('optional');
		});

		it('is deterministic given the same seed', () => {
			const schema: IJsonSchema = {
				type: 'object',
				properties: {
					a: { type: 'integer' },
					b: { type: 'string' },
				},
				required: ['a', 'b'],
			};
			const a = generateMockFromSchema(
				schema,
				{ randomize: true },
				{ nextSeed: deterministicInt(42) },
			);
			const b = generateMockFromSchema(
				schema,
				{ randomize: true },
				{ nextSeed: deterministicInt(42) },
			);
			expect(a).toEqual(b);
		});
	});

	describe('generateOperationMock', () => {
		const fixtureOperation: IOpenApiOperation = {
			operationId: 'getUser',
			method: 'GET',
			path: '/users/{id}',
			parameters: [],
			responses: [
				{
					status: '200',
					description: 'OK',
					contentType: 'application/json',
					schema: {
						type: 'object',
						properties: {
							id: { type: 'integer' },
							email: { type: 'string', format: 'email' },
						},
						required: ['id', 'email'],
					},
				},
				{
					status: '404',
					description: 'Not Found',
					contentType: 'application/json',
					schema: {
						type: 'object',
						properties: {
							message: { type: 'string' },
						},
						required: ['message'],
					},
				},
			],
			tags: [],
		};

		it('emits one mock per declared response', () => {
			const out = generateOperationMock(
				fixtureOperation,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			);
			expect(out.responses).toHaveLength(2);
			expect(out.responses.map((r) => r.status)).toEqual(['200', '404']);
			expect(out.responses[0]?.contentType).toBe('application/json');
		});

		it('mockResponseForStatus picks the declared status', () => {
			const out = mockResponseForStatus(
				fixtureOperation,
				404,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			);
			expect(out?.status).toBe('404');
			const body = out?.body as { message: string };
			expect(body.message).toMatch(/^string-/);
		});

		it('mockResponseForStatus falls back to default when status missing', () => {
			const operation: IOpenApiOperation = {
				...fixtureOperation,
				responses: [
					{
						status: 'default',
						description: 'err',
						schema: { type: 'string' },
					},
				],
			};
			const out = mockResponseForStatus(
				operation,
				500,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			);
			expect(out?.status).toBe('default');
		});

		it('mockHappyPath prefers the first 2xx', () => {
			const out = mockHappyPath(
				fixtureOperation,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			);
			expect(out?.status).toBe('200');
		});

		it('mockHappyPath falls back to default when no 2xx exists', () => {
			const operation: IOpenApiOperation = {
				...fixtureOperation,
				responses: [
					{
						status: 'default',
						description: 'err',
						schema: { type: 'string' },
					},
				],
			};
			const out = mockHappyPath(
				operation,
				{ randomize: false },
				{ nextSeed: deterministicInt(1) },
			);
			expect(out?.status).toBe('default');
		});
	});
});
