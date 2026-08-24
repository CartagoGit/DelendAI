import { describe, expect, it } from 'vitest';

import { buildApiCallToolRegistration } from './api-call.tool';
import { parseOpenApi } from '../spec/openapi';
import type { IOpenApiSpec } from '../spec/openapi';
import type {
	IWebFetchResult,
	IWebFetchOptions,
} from '@mcp-vertex/web-fetch/public';

class FakeServer {
	tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> = {};
	registerTool(
		name: string,
		_meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parseOk = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const parseError = (r: unknown): { reason: string; nextAction?: string } => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	const envelope = JSON.parse(text) as {
		error?: { reason: string; nextAction?: string };
	};
	return envelope.error ?? { reason: '' };
};

const HTTP_OK = new Response().status;
const HTTP_CREATED = HTTP_OK + 'a'.length;
const HTTP_OK_STATUS = String(HTTP_OK);
const HTTP_CREATED_STATUS = String(HTTP_CREATED);
const USER_ID = 'alice';
const API_KEY_VALUE = 'key-abc';
const GET_USER_URL = `https://api.example.com/v1/users/${USER_ID}`;
const GET_USER_BODY = `{"id":"${USER_ID}","name":"Alice"}`;
const OK_BODY = '{"ok":true}';
const CREATED_BODY = '{"id":"created"}';

const FIXTURE_SPEC = parseOpenApi(
	JSON.stringify({
		openapi: '3.0.0',
		info: { title: 'Test', version: '1.0.0' },
		servers: [{ url: 'https://api.example.com/v1' }],
		paths: {
			'/users/{id}': {
				get: {
					operationId: 'getUser',
					parameters: [
						{
							name: 'id',
							in: 'path',
							required: true,
							schema: { type: 'string' },
						},
					],
					responses: { [HTTP_OK_STATUS]: { description: 'OK' } },
				},
			},
		},
	}),
);

const stubFetch = (response: IWebFetchResult) =>
	(async (_opts: IWebFetchOptions): Promise<IWebFetchResult> =>
		response) as never;

const build = (
	opts: {
		spec?: IOpenApiSpec;
		fetchImpl?: ReturnType<typeof stubFetch>;
		allowList?: readonly string[];
	} = {},
) => {
	const regs = buildApiCallToolRegistration({
		namespacePrefix: 'api',
		...(opts.spec === undefined ? {} : { spec: opts.spec }),
		...(opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }),
		...(opts.allowList === undefined
			? {}
			: { defaultAllowList: opts.allowList }),
	});
	const server = new FakeServer();
	for (const r of [regs]) void r.register(server as never);
	return server.tools;
};

describe('api-call (f00130 S1)', () => {
	it('registers under the namespace prefix', () => {
		const tools = build();
		expect(Object.keys(tools).sort()).toEqual(['api_api_call']);
	});

	it('returns an actionable error when no spec is provided', async () => {
		const tools = build();
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const err = parseError(await handler({ operationId: 'getUser' }));
		expect(err.reason).toMatch(/spec or specUrl/);
	});

	it('returns an actionable error when the operationId is unknown', async () => {
		const tools = build({ spec: FIXTURE_SPEC });
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const err = parseError(await handler({ operationId: 'missing' }));
		expect(err.reason).toMatch(/not in spec/);
	});

	it('returns an actionable error when buildRequest throws (missing required param)', async () => {
		const tools = build({ spec: FIXTURE_SPEC });
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const err = parseError(await handler({ operationId: 'getUser' }));
		expect(err.reason).toMatch(/buildRequest failed/);
	});

	it('returns the rendered request + response on success', async () => {
		const tools = build({
			spec: FIXTURE_SPEC,
			allowList: ['api.example.com'],
			fetchImpl: stubFetch({
				ok: true,
				url: GET_USER_URL,
				status: HTTP_OK,
				contentType: 'application/json',
				body: GET_USER_BODY,
				truncated: false,
			}),
		});
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({ operationId: 'getUser', params: { id: USER_ID } }),
		);
		const request = out.request as { url: string; method: string };
		expect(request.url).toBe(GET_USER_URL);
		expect(request.method).toBe('GET');
		const response = out.response as { status: number; body: string };
		expect(response.status).toBe(HTTP_OK);
		expect(response.body).toContain('Alice');
	});

	it('redacts sensitive headers in the output request projection only', async () => {
		const specWithHeaders = parseOpenApi(
			JSON.stringify({
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0.0' },
				servers: [{ url: 'https://api.example.com/v1' }],
				paths: {
					'/users/{id}': {
						get: {
							operationId: 'getUserWithHeaders',
							parameters: [
								{
									name: 'id',
									in: 'path',
									required: true,
									schema: { type: 'string' },
								},
								{
									name: 'Authorization',
									in: 'header',
									required: true,
									schema: { type: 'string' },
								},
								{
									name: 'Cookie',
									in: 'header',
									required: true,
									schema: { type: 'string' },
								},
								{
									name: 'X-Api-Key',
									in: 'header',
									required: true,
									schema: { type: 'string' },
								},
								{
									name: 'Accept',
									in: 'header',
									required: true,
									schema: { type: 'string' },
								},
							],
							responses: {
								[HTTP_OK_STATUS]: { description: 'OK' },
							},
						},
					},
				},
			}),
		);
		let seenOpts: IWebFetchOptions | undefined;
		const tools = build({
			spec: specWithHeaders,
			allowList: ['api.example.com'],
			fetchImpl: (async (opts: IWebFetchOptions) => {
				seenOpts = opts;
				return {
					ok: true,
					url: opts.url,
					status: HTTP_OK,
					contentType: 'application/json',
					body: OK_BODY,
					truncated: false,
				};
			}) as never,
		});
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				operationId: 'getUserWithHeaders',
				params: {
					id: USER_ID,
					Authorization: 'Bearer secret-token',
					Cookie: 'sid=abc',
					'X-Api-Key': API_KEY_VALUE,
					Accept: 'application/json',
				},
			}),
		);
		const request = out.request as {
			headers: Record<string, string>;
		};
		expect(request.headers.authorization).toBe('***');
		expect(request.headers.cookie).toBe('***');
		expect(request.headers['x-api-key']).toBe('***');
		expect(request.headers.accept).toBe('application/json');
		expect(seenOpts?.headers?.authorization).toBe('Bearer secret-token');
		expect(seenOpts?.headers?.cookie).toBe('sid=abc');
		expect(seenOpts?.headers?.['x-api-key']).toBe(API_KEY_VALUE);
	});

	// x00169: `request.method` / `.headers` / `.body` used to be built and
	// then silently dropped — every call reached webFetch as a bare
	// `{url, allowList}`, so auth headers and request bodies never left
	// the process.
	it('forwards the built method, headers and body to the fetch seam', async () => {
		const specWithBody = parseOpenApi(
			JSON.stringify({
				openapi: '3.0.0',
				info: { title: 'Test', version: '1.0.0' },
				servers: [{ url: 'https://api.example.com/v1' }],
				paths: {
					'/users': {
						post: {
							operationId: 'createUser',
							parameters: [
								{
									name: 'Authorization',
									in: 'header',
									required: true,
									schema: { type: 'string' },
								},
							],
							requestBody: {
								content: { 'application/json': { schema: {} } },
							},
							responses: {
								[HTTP_CREATED_STATUS]: {
									description: 'Created',
								},
							},
						},
					},
				},
			}),
		);
		let seenOpts: IWebFetchOptions | undefined;
		const tools = build({
			spec: specWithBody,
			allowList: ['api.example.com'],
			fetchImpl: (async (opts: IWebFetchOptions) => {
				seenOpts = opts;
				return {
					ok: true,
					url: opts.url,
					status: HTTP_CREATED,
					contentType: 'application/json',
					body: CREATED_BODY,
					truncated: false,
				};
			}) as never,
		});
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		await handler({
			operationId: 'createUser',
			params: { Authorization: 'Bearer tok' },
			body: { name: 'Alice' },
		});
		expect(seenOpts?.method).toBe('POST');
		expect(seenOpts?.headers?.authorization).toBe('Bearer tok');
		expect(seenOpts?.body).toBe('{"name":"Alice"}');
	});

	it('returns a structured error envelope when webFetch rejects the request', async () => {
		const tools = build({
			spec: FIXTURE_SPEC,
			allowList: ['api.example.com'],
			fetchImpl: stubFetch({
				ok: false,
				reason: 'blocked-host',
				detail: 'evil.example.com',
			}),
		});
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const err = parseError(
			await handler({ operationId: 'getUser', params: { id: USER_ID } }),
		);
		expect(err.reason).toMatch(/blocked-host/);
	});
});
