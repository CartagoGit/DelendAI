import { describe, expect, it } from 'vitest';

import { parseOpenApi } from '../spec/openapi';
import { buildApiValidateToolRegistration } from '../tools/api-validate.tool';

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
									required: ['id'],
									properties: { id: { type: 'integer' } },
								},
							},
						},
					},
				},
			},
		},
	},
});

const build = (spec = FIXTURE_SPEC) => {
	const registration = buildApiValidateToolRegistration({
		namespacePrefix: 'api',
		spec,
	});
	const server = new FakeServer();
	void registration.register(server as never);
	return server.tools;
};

describe('api_validate tool', () => {
	it('registers under the namespace prefix', () => {
		expect(Object.keys(build())).toEqual(['api_api_validate']);
	});

	it('returns the normalized validation result on success', async () => {
		const handler = build().api_api_validate?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({
				operationId: 'getUser',
				responseBody: { id: '1' },
			}),
		);
		expect(out.ok).toBe(true);
		expect((out.summary as { high: number }).high).toBe(1);
	});

	it('supports method + path lookup and inline spec overrides', async () => {
		const handler = build().api_api_validate?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseEnvelope(
			await handler({
				method: 'GET',
				path: '/users/{id}',
				responseBody: { id: 1 },
				spec: FIXTURE_SPEC,
			}),
		);
		expect((out.mismatches as unknown[]).length).toBe(0);
	});
});
