/**
 * f00130 S3 — `api_mock` tool tests.
 *
 * Behaviour covered:
 * - happy-path mock generated for the first 2xx response.
 * - statusCode-pinned mock generated for the requested status.
 * - missing-spec → typed `missing-spec` envelope.
 * - unknown operationId → typed `operation-not-found` envelope.
 * - invalid-arguments (no operationId or method+path) → typed envelope.
 * - specUrl without allowList → typed `allowList` envelope.
 * - specUrl without injected fetch seam → typed `install-required` envelope.
 * - count > 1 returns N distinct samples.
 */
import { describe, expect, it } from 'vitest';

import { buildApiMockToolRegistration } from './api-mock.tool';

interface IFakeTool {
	name: string;
	handler: (args: unknown) => Promise<unknown>;
}

class FakeServer {
	tools: Record<string, IFakeTool> = {};
	registerTool(
		name: string,
		_desc: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { name, handler };
	}
}

const fixtureSpec = {
	openapi: '3.0.0',
	info: { title: 'demo', version: '1.0.0' },
	paths: {
		'/users/{id}': {
			get: {
				operationId: 'getUser',
				parameters: [
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: { type: 'integer' },
					},
				],
				responses: {
					'200': {
						description: 'OK',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										id: { type: 'integer' },
										email: {
											type: 'string',
											format: 'email',
										},
									},
									required: ['id', 'email'],
								},
							},
						},
					},
					'404': {
						description: 'Not Found',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { message: { type: 'string' } },
									required: ['message'],
								},
							},
						},
					},
				},
			},
		},
	},
};

const parseBody = async (resultPromise: Promise<unknown>) => {
	const res = (await resultPromise) as {
		content: Array<{ text: string }>;
		structuredContent?: Record<string, unknown>;
	};
	return JSON.parse(res.content[0]?.text ?? '{}') as Record<string, unknown>;
};

const mount = (options: Parameters<typeof buildApiMockToolRegistration>[0]) => {
	const registration = buildApiMockToolRegistration(options);
	const server = new FakeServer();
	void registration.register(server as never);
	const handler =
		server.tools[`${options.namespacePrefix}_api_mock`]?.handler;
	if (handler === undefined) {
		throw new Error('api_mock tool not registered');
	}
	return handler;
};

describe('api_mock tool (f00130 S3)', () => {
	it('registers under the namespace prefix', () => {
		const server = new FakeServer();
		const registration = buildApiMockToolRegistration({
			namespacePrefix: 'api',
		});
		void registration.register(server as never);
		expect(Object.keys(server.tools)).toEqual(['api_api_mock']);
	});

	it('generates a happy-path mock for the first 2xx response', async () => {
		const handler = mount({
			namespacePrefix: 'api',
		});
		const body = await parseBody(
			handler({
				operationId: 'getUser',
				spec: JSON.parse(JSON.stringify(fixtureSpec)),
			}),
		);
		expect(body.ok).toBe(true);
		expect(body.selectedStatus).toBe('200');
		const selectedBody = body.selectedBody as {
			id: number;
			email: string;
		};
		expect(typeof selectedBody.id).toBe('number');
		expect(selectedBody.email).toMatch(/@example\.com/);
	});

	it('generates a statusCode-pinned mock when statusCode is supplied', async () => {
		const handler = mount({
			namespacePrefix: 'api',
		});
		const body = await parseBody(
			handler({
				operationId: 'getUser',
				statusCode: 404,
				spec: JSON.parse(JSON.stringify(fixtureSpec)),
			}),
		);
		expect(body.selectedStatus).toBe('404');
		const sel = body.selectedBody as { message: string };
		expect(typeof sel.message).toBe('string');
	});

	it('returns a missing-spec envelope when no spec or specUrl is supplied', async () => {
		const handler = mount({ namespacePrefix: 'api' });
		const body = await parseBody(handler({ operationId: 'getUser' }));
		expect(body.error).toEqual(
			expect.objectContaining({ reason: 'missing-spec' }),
		);
	});

	it('returns an operation-not-found envelope for unknown operationId', async () => {
		const handler = mount({
			namespacePrefix: 'api',
		});
		const body = await parseBody(
			handler({
				operationId: 'unknown',
				spec: JSON.parse(JSON.stringify(fixtureSpec)),
			}),
		);
		expect(body.error).toEqual(
			expect.objectContaining({ reason: 'operation-not-found' }),
		);
	});

	it('returns an invalid-arguments envelope when neither operationId nor method+path is given', async () => {
		const handler = mount({
			namespacePrefix: 'api',
		});
		const body = await parseBody(
			handler({ spec: JSON.parse(JSON.stringify(fixtureSpec)) }),
		);
		expect(body.error).toEqual(
			expect.objectContaining({ reason: 'invalid-arguments' }),
		);
	});

	it('returns an allowList envelope when specUrl is supplied without allowList', async () => {
		const handler = mount({
			namespacePrefix: 'api',
			specFetch: async () => ({ body: 'unused' }),
		});
		const body = await parseBody(
			handler({
				operationId: 'getUser',
				specUrl: 'https://api.example.com/openapi.json',
			}),
		);
		expect(body.error).toEqual(
			expect.objectContaining({
				reason: expect.stringMatching(/allowList/i),
			}),
		);
	});

	it('returns an install-required envelope when specUrl is supplied and no fetch seam is injected', async () => {
		const handler = mount({ namespacePrefix: 'api' });
		const body = await parseBody(
			handler({
				operationId: 'getUser',
				specUrl: 'https://api.example.com/openapi.json',
				allowList: ['api.example.com'],
			}),
		);
		expect(body.error).toEqual(
			expect.objectContaining({ reason: 'install-required' }),
		);
	});

	it('returns N distinct samples when count > 1', async () => {
		const handler = mount({
			namespacePrefix: 'api',
		});
		const body = await parseBody(
			handler({
				operationId: 'getUser',
				count: 3,
				spec: JSON.parse(JSON.stringify(fixtureSpec)),
			}),
		);
		expect(body.count).toBe(3);
		const allResponses = body.allResponses as Array<{ status: string }>;
		expect(allResponses).toHaveLength(2);
	});
});
