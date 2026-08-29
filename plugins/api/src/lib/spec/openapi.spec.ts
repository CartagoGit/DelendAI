import { describe, expect, it } from 'vitest';

import { buildRequest } from './build-request';
import { parseOpenApi } from './openapi';
import type { IOpenApiOperation } from './openapi';

const FIXTURE = JSON.stringify({
	openapi: '3.0.0',
	info: { title: 'Test', version: '1.0.0' },
	servers: [{ url: 'https://api.example.com/v1' }],
	paths: {
		'/users/{id}': {
			get: {
				operationId: 'getUser',
				summary: 'Fetch a user',
				parameters: [
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: { type: 'string' },
					},
					{
						name: 'verbose',
						in: 'query',
						required: false,
						schema: { type: 'boolean' },
					},
				],
				responses: {
					'200': {
						description: 'OK',
						content: {
							'application/json': { schema: { type: 'object' } },
						},
					},
				},
			},
		},
		'/users': {
			post: {
				operationId: 'createUser',
				tags: ['users'],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['name'],
								properties: {
									name: { type: 'string' },
									age: { type: 'integer' },
								},
							},
						},
					},
				},
				responses: { '201': { description: 'Created' } },
			},
		},
	},
});

describe('parseOpenApi', () => {
	it('parses a valid spec and indexes operations by operationId', () => {
		const spec = parseOpenApi(FIXTURE);
		expect(spec.title).toBe('Test');
		expect(spec.version).toBe('1.0.0');
		expect(spec.servers).toEqual(['https://api.example.com/v1']);
		expect(Object.keys(spec.operations)).toEqual(['getUser', 'createUser']);
	});

	it('captures path/query parameters', () => {
		const spec = parseOpenApi(FIXTURE);
		const op = spec.operations.getUser as IOpenApiOperation;
		expect(op.method).toBe('GET');
		expect(op.path).toBe('/users/{id}');
		const id = op.parameters.find(
			(p) => p.name === 'id' && p.in === 'path',
		);
		expect(id?.required).toBe(true);
		const verbose = op.parameters.find(
			(p) => p.name === 'verbose' && p.in === 'query',
		);
		expect(verbose?.required).toBe(false);
	});

	it('captures requestBody for POST', () => {
		const spec = parseOpenApi(FIXTURE);
		const op = spec.operations.createUser as IOpenApiOperation;
		expect(op.requestBody?.required).toBe(true);
		expect(op.requestBody?.contentType).toBe('application/json');
		expect(op.requestBody?.schema.required).toEqual(['name']);
	});

	it('returns a soft-error parseNote on invalid JSON', () => {
		const spec = parseOpenApi('not-json');
		expect(spec.operations).toEqual({});
		expect(spec.parseNote).toMatch(/not valid JSON/);
	});

	it('returns a soft-error parseNote on a non-object input', () => {
		const spec = parseOpenApi('"a string"');
		expect(spec.parseNote).toMatch(/not an object/);
	});
});

describe('buildRequest', () => {
	it('substitutes path params and builds the URL', () => {
		const spec = parseOpenApi(FIXTURE);
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: '42', verbose: true },
			specServers: spec.servers,
		});
		expect(req.method).toBe('GET');
		expect(req.url).toBe(
			'https://api.example.com/v1/users/42?verbose=true',
		);
	});

	it('omits optional query params when not supplied', () => {
		const spec = parseOpenApi(FIXTURE);
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: '42' },
			specServers: spec.servers,
		});
		expect(req.url).toBe('https://api.example.com/v1/users/42');
	});

	it('throws when a required path param is missing', () => {
		const spec = parseOpenApi(FIXTURE);
		expect(() =>
			buildRequest({
				operation: spec.operations.getUser as IOpenApiOperation,
				params: {},
				specServers: spec.servers,
			}),
		).toThrow(/path parameter: id/);
	});

	it('stringifies a JSON body when the operation declares requestBody', () => {
		const spec = parseOpenApi(FIXTURE);
		const req = buildRequest({
			operation: spec.operations.createUser as IOpenApiOperation,
			body: { name: 'Alice', age: 30 },
			specServers: spec.servers,
		});
		expect(req.method).toBe('POST');
		expect(req.body).toBe('{"name":"Alice","age":30}');
		expect(req.headers['content-type']).toBe('application/json');
	});

	it('honours a caller-supplied baseUrl', () => {
		const spec = parseOpenApi(FIXTURE);
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: '42' },
			baseUrl: 'https://staging.example.com/v2/',
			specServers: spec.servers,
		});
		expect(req.url).toBe('https://staging.example.com/v2/users/42');
	});

	it('keeps the exact request shape when the baseUrl carries repeated trailing slashes', () => {
		const spec = parseOpenApi(FIXTURE);
		expect(
			buildRequest({
				operation: spec.operations.getUser as IOpenApiOperation,
				params: { id: '42', verbose: true },
				baseUrl: 'https://staging.example.com/v2////',
				specServers: spec.servers,
			}),
		).toEqual({
			method: 'GET',
			url: 'https://staging.example.com/v2/users/42?verbose=true',
			headers: {},
		});
	});

	it('handles a baseUrl with a long trailing slash run without pathological slowdown', () => {
		const spec = parseOpenApi(FIXTURE);
		const startedAt = performance.now();
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: '42' },
			baseUrl: `https://staging.example.com${'/'.repeat(20_000)}`,
			specServers: spec.servers,
		});
		expect(req.url).toBe('https://staging.example.com/users/42');
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
