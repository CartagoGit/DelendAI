import { describe, expect, it } from 'vitest';

import { buildRequest } from './build-request';
import { parseOpenApi } from './openapi';
import type { IOpenApiOperation } from './openapi';

const HTTP_OK = new Response().status;
const HTTP_CREATED = HTTP_OK + 'a'.length;
const STATUS_OK = String(HTTP_OK);
const STATUS_CREATED = String(HTTP_CREATED);
const USER_ID = 'alice';
const TEST_AGE = 'maintainer'.length;

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
					[STATUS_OK]: {
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
				responses: { [STATUS_CREATED]: { description: 'Created' } },
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
			params: { id: USER_ID, verbose: true },
			specServers: spec.servers,
		});
		expect(req.method).toBe('GET');
		expect(req.url).toBe(
			`https://api.example.com/v1/users/${USER_ID}?verbose=true`,
		);
	});

	it('omits optional query params when not supplied', () => {
		const spec = parseOpenApi(FIXTURE);
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: USER_ID },
			specServers: spec.servers,
		});
		expect(req.url).toBe(`https://api.example.com/v1/users/${USER_ID}`);
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
			body: { name: 'Alice', age: TEST_AGE },
			specServers: spec.servers,
		});
		expect(req.method).toBe('POST');
		expect(req.body).toBe(JSON.stringify({ name: 'Alice', age: TEST_AGE }));
		expect(req.headers['content-type']).toBe('application/json');
	});

	it('honours a caller-supplied baseUrl', () => {
		const spec = parseOpenApi(FIXTURE);
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: USER_ID },
			baseUrl: 'https://staging.example.com/v2/',
			specServers: spec.servers,
		});
		expect(req.url).toBe(`https://staging.example.com/v2/users/${USER_ID}`);
	});

	it('keeps the exact request shape when the baseUrl carries repeated trailing slashes', () => {
		const spec = parseOpenApi(FIXTURE);
		expect(
			buildRequest({
				operation: spec.operations.getUser as IOpenApiOperation,
				params: { id: USER_ID, verbose: true },
				baseUrl: 'https://staging.example.com/v2////',
				specServers: spec.servers,
			}),
		).toEqual({
			method: 'GET',
			url: `https://staging.example.com/v2/users/${USER_ID}?verbose=true`,
			headers: {},
		});
	});

	it('handles a baseUrl with a long trailing slash run without pathological slowdown', () => {
		const spec = parseOpenApi(FIXTURE);
		const startedAt = performance.now();
		const req = buildRequest({
			operation: spec.operations.getUser as IOpenApiOperation,
			params: { id: USER_ID },
			baseUrl: `https://staging.example.com${'/'.repeat(20_000)}`,
			specServers: spec.servers,
		});
		expect(req.url).toBe(`https://staging.example.com/users/${USER_ID}`);
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
