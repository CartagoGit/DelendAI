import { describe, expect, it } from 'vitest';

import type { IFetchLike } from '@delendai/web-fetch/public';

import { parseOpenApi } from '../spec/openapi';
import { buildApiValidateToolRegistration } from './api-validate.tool';

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

const parseEnvelope = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const FIXTURE_SPEC = parseOpenApi({
	openapi: '3.0.0',
	info: { title: 'Users', version: '1.0.0' },
	paths: {
		'/users/{id}': {
			get: {
				operationId: 'getUser',
				responses: {
					'200': {
						description: 'OK',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['id', 'email'],
									properties: {
										id: { type: 'integer' },
										email: {
											type: 'string',
											format: 'email',
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

const streamResponse = (text: string): Awaited<ReturnType<IFetchLike>> => ({
	ok: true,
	status: 200,
	headers: { get: () => 'application/json' },
	body: new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	}),
	text: async () => text,
});

const build = (
	options: { spec?: typeof FIXTURE_SPEC; specFetch?: IFetchLike } = {},
) => {
	const registration = buildApiValidateToolRegistration({
		namespacePrefix: 'api',
		...(options.spec === undefined ? {} : { spec: options.spec }),
		...(options.specFetch === undefined
			? {}
			: { specFetch: options.specFetch }),
	});
	const server = new FakeServer();
	void registration.register(server as never);
	return server.tools;
};

describe('api_validate tool (f00130 S2)', () => {
	it('registers under the namespace prefix', () => {
		expect(Object.keys(build({ spec: FIXTURE_SPEC })).sort()).toEqual([
			'api_api_validate',
		]);
	});

	it('returns an empty findings array for a valid response', async () => {
		const handler = build({ spec: FIXTURE_SPEC }).api_api_validate
			?.handler as (a: unknown) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({
				operationId: 'getUser',
				response: { id: 1, email: 'ada@example.com' },
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.findings).toEqual([]);
	});

	it('returns findings instead of crashing on schema mismatches', async () => {
		const handler = build({ spec: FIXTURE_SPEC }).api_api_validate
			?.handler as (a: unknown) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({ operationId: 'getUser', response: { id: '1' } }),
		);
		expect(out.ok).toBe(true);
		expect((out.findings as unknown[]).length).toBeGreaterThan(0);
	});

	it('returns an install hint when no spec or specUrl is provided', async () => {
		const handler = build().api_api_validate?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({ operationId: 'getUser', response: { id: 1 } }),
		);
		expect(out.ok).toBe(false);
		expect((out.error as { reason: string }).reason).toMatch(
			/spec or specUrl/,
		);
	});

	it('returns an install hint for an unknown operationId', async () => {
		const handler = build({ spec: FIXTURE_SPEC }).api_api_validate
			?.handler as (a: unknown) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({ operationId: 'missing', response: { id: 1 } }),
		);
		expect(out.ok).toBe(false);
		expect((out.error as { reason: string }).reason).toMatch(/not in spec/);
	});

	it('supports loading the spec from specUrl via an injected fetch seam', async () => {
		const specFetch: IFetchLike = async () =>
			streamResponse(
				JSON.stringify({
					openapi: '3.0.0',
					info: { title: 'Users', version: '1.0.0' },
					paths: {
						'/users/{id}': {
							get: {
								operationId: 'getUser',
								responses: {
									'200': {
										description: 'OK',
										content: {
											'application/json': {
												schema: {
													type: 'object',
													required: ['id'],
													properties: {
														id: { type: 'integer' },
													},
												},
											},
										},
									},
								},
							},
						},
					},
				}),
			);
		const handler = build({ specFetch }).api_api_validate?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({
				operationId: 'getUser',
				response: { id: 1 },
				specUrl: 'https://spec.example.com/openapi.json',
				allowList: ['spec.example.com'],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.findings).toEqual([]);
	});
});
