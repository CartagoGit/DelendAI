import { describe, expect, it } from 'vitest';

import { buildRequest } from './build-request';
import type { IFetchLike } from '@delendai/web-fetch/public';

import { fetchAndParseSpec, parseOpenApi } from './openapi';
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

describe('fetchAndParseSpec', () => {
	const spec = JSON.stringify({
		openapi: '3.0.0',
		info: { title: 't', version: '1' },
		paths: {},
	});
	const serving =
		(body: string): IFetchLike =>
		async () => ({
			ok: true,
			status: HTTP_OK,
			headers: { get: () => null },
			text: async () => body,
		});

	it('refuses a host outside the allow-list before fetching', async () => {
		let fetched = false;
		const loaded = await fetchAndParseSpec({
			url: 'https://evil.example/spec.json',
			allowList: ['api.example.com'],
			fetch: async (...args) => {
				fetched = true;
				return serving(spec)(...args);
			},
		});
		expect(loaded).toMatchObject({ ok: false });
		expect(fetched).toBe(false);
	});

	it('refuses a spec larger than maxBytes instead of parsing half of it', async () => {
		const loaded = await fetchAndParseSpec({
			url: 'https://api.example.com/spec.json',
			allowList: ['api.example.com'],
			maxBytes: 'tiny'.length,
			fetch: serving(spec),
		});
		expect(loaded).toMatchObject({ ok: false });
		expect(loaded.ok ? '' : loaded.reason).toContain('maxBytes');
	});

	it('parses a spec within the cap', async () => {
		const loaded = await fetchAndParseSpec({
			url: 'https://api.example.com/spec.json',
			allowList: ['api.example.com'],
			fetch: serving(spec),
		});
		expect(loaded.ok && loaded.spec.title).toBe('t');
	});
});

describe('the parser keeps what validation needs', () => {
	const specWith = (schema: unknown, components: unknown = {}) =>
		parseOpenApi({
			openapi: '3.0.0',
			info: { title: 't', version: '1' },
			components,
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
		});
	const schemaOf = (spec: ReturnType<typeof parseOpenApi>) =>
		spec.operations.x?.responses[0]?.schema;

	it('keeps nullable from both OpenAPI spellings', () => {
		expect(schemaOf(specWith({ type: 'string', nullable: true }))).toEqual({
			type: 'string',
			nullable: true,
		});
		expect(schemaOf(specWith({ type: ['integer', 'null'] }))).toEqual({
			type: 'integer',
			nullable: true,
		});
	});

	it('reads the boolean exclusive bounds of OpenAPI 3.0', () => {
		expect(
			schemaOf(
				specWith({
					type: 'number',
					minimum: 1,
					exclusiveMinimum: true,
					maximum: 9,
				}),
			),
		).toEqual({ type: 'number', exclusiveMinimum: 1, maximum: 9 });
	});

	it('keeps closed objects, unions and string bounds', () => {
		expect(
			schemaOf(
				specWith({
					additionalProperties: false,
					oneOf: [{ type: 'string', minLength: 2, maxLength: 3 }],
				}),
			),
		).toEqual({
			additionalProperties: false,
			oneOf: [{ type: 'string', minLength: 2, maxLength: 3 }],
		});
	});

	it('expands local references', () => {
		const spec = specWith(
			{ $ref: '#/components/schemas/User' },
			{ schemas: { User: { type: 'object', required: ['id'] } } },
		);
		expect(schemaOf(spec)).toEqual({ type: 'object', required: ['id'] });
		expect(spec.parseNote).toBe('parsed');
	});

	it('names the references it could not follow', () => {
		const spec = specWith(
			{ $ref: '#/components/schemas/Loop' },
			{
				schemas: {
					Loop: {
						properties: {
							next: { $ref: '#/components/schemas/Loop' },
							far: { $ref: 'other.yaml#/Thing' },
						},
					},
				},
			},
		);
		expect(schemaOf(spec)?.properties?.next).toEqual({});
		expect(spec.parseNote).toContain('2 $ref');
	});

	it('stops expanding a spec built to multiply', () => {
		const schemas: Record<string, unknown> = { L0: { type: 'string' } };
		for (let level = 1; level < 30; level += 1) {
			const ref = { $ref: `#/components/schemas/L${level - 1}` };
			schemas[`L${level}`] = { properties: { a: ref, b: ref } };
		}
		const spec = specWith(
			{ $ref: '#/components/schemas/L29' },
			{ schemas },
		);
		expect(spec.parseNote).toContain('$ref');
	});
});

describe('buildRequest sends what the spec describes', () => {
	const operation = (
		over: Partial<IOpenApiOperation>,
	): IOpenApiOperation => ({
		operationId: 'op',
		method: 'POST',
		path: '/x',
		parameters: [],
		responses: [],
		tags: [],
		...over,
	});
	const cookie = (name: string, required: boolean) => ({
		name,
		in: 'cookie' as const,
		required,
		schema: {},
	});
	const jsonBody = (required: boolean) => ({
		required,
		contentType: 'application/json',
		schema: {},
	});

	it('sends cookie parameters in one header', () => {
		const request = buildRequest({
			operation: operation({
				parameters: [
					cookie('session', true),
					cookie('theme', false),
					cookie('lang', false),
				],
			}),
			params: { session: 'a b', lang: 'es' },
		});
		expect(request.headers.cookie).toBe('session=a%20b; lang=es');
	});

	it('refuses a missing required cookie', () => {
		expect(() =>
			buildRequest({
				operation: operation({ parameters: [cookie('session', true)] }),
			}),
		).toThrow(/required cookie parameter: session/);
	});

	it('leaves the cookie header out when no cookie is sent', () => {
		const request = buildRequest({
			operation: operation({ parameters: [cookie('theme', false)] }),
		});
		expect(request.headers).toEqual({});
	});

	it('refuses a missing required body', () => {
		expect(() =>
			buildRequest({
				operation: operation({ requestBody: jsonBody(true) }),
			}),
		).toThrow(/missing required request body/);
	});

	it('declares no content type for an optional body left out', () => {
		const request = buildRequest({
			operation: operation({ requestBody: jsonBody(false) }),
		});
		expect(request.headers).toEqual({});
		expect(request.body).toBeUndefined();
	});

	it('refuses a body the operation has no place for', () => {
		expect(() =>
			buildRequest({ operation: operation({}), body: { a: 1 } }),
		).toThrow(/declares no request body/);
	});

	it('refuses a body it cannot encode', () => {
		expect(() =>
			buildRequest({
				operation: operation({
					requestBody: {
						required: true,
						contentType: 'multipart/form-data',
						schema: {},
					},
				}),
				body: { a: 1 },
			}),
		).toThrow(/JSON only/);
	});

	it('sends a vendor JSON body', () => {
		const request = buildRequest({
			operation: operation({
				requestBody: {
					required: true,
					contentType: 'application/vnd.api+json',
					schema: {},
				},
			}),
			body: { a: 1 },
		});
		expect(request.body).toBe('{"a":1}');
	});

	it('records a required non-JSON body from the spec', () => {
		const spec = parseOpenApi({
			paths: {
				'/x': {
					post: {
						operationId: 'x',
						requestBody: {
							required: true,
							content: { 'text/plain': {} },
						},
						responses: {},
					},
				},
			},
		});
		expect(spec.operations.x?.requestBody?.contentType).toBe('text/plain');
	});
});
