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
					responses: { '200': { description: 'OK' } },
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
				url: 'https://api.example.com/v1/users/42',
				status: 200,
				contentType: 'application/json',
				body: '{"id":42,"name":"Alice"}',
				truncated: false,
			}),
		});
		const handler = tools.api_api_call?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({ operationId: 'getUser', params: { id: '42' } }),
		);
		const request = out.request as { url: string; method: string };
		expect(request.url).toBe('https://api.example.com/v1/users/42');
		expect(request.method).toBe('GET');
		const response = out.response as { status: number; body: string };
		expect(response.status).toBe(200);
		expect(response.body).toContain('Alice');
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
							responses: { '201': { description: 'Created' } },
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
					status: 201,
					contentType: 'application/json',
					body: '{"id":1}',
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
			await handler({ operationId: 'getUser', params: { id: '42' } }),
		);
		expect(err.reason).toMatch(/blocked-host/);
	});
});
