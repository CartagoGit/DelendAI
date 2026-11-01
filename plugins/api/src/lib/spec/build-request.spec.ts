import { describe, expect, it } from 'vitest';

import { buildRequest } from './build-request';
import { parseOpenApi } from './openapi';
import type { IOpenApiOperation } from './openapi';

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
