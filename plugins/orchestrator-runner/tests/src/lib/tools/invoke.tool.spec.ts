/**
 * invoke.tool.spec.ts — v00130 (AUD-B01) regression pin.
 *
 * `invoke` used to declare its full, exported `InvokeOutputSchema` as the
 * wire `outputSchema` (~9.1 KB in the `vertex` preset). It now declares
 * `compactOutputSchema()` instead. `InvokeOutputSchema` is not used as a
 * runtime response validator anywhere in `invoke.tool.ts` (verified by
 * inspection — no `.parse()`/`.safeParse()` of it against the handler's
 * return value), so there is no separate internal schema to preserve; it
 * stays exported from `schemas.ts` purely for callers/consumers, unrelated
 * to this test. This fails the day the declared schema regrows.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@mcp-vertex/test-kit/public';

import { buildInvokeRegistration } from '../../../../src/lib/tools/invoke.tool';
import type { InvocationManager } from '../../../../src/lib/invoke/manager';

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

describe('invoke tool', () => {
	it('declares a compact outputSchema, not the full InvokeOutputSchema shape', async () => {
		let outputSchema: unknown;
		const server = createFakeToolServer({
			onRegisterTool: (call) => {
				outputSchema = (call.config as { outputSchema?: unknown })
					.outputSchema;
			},
		});
		const registration = buildInvokeRegistration({
			namespacePrefix: 'mcp',
			manager: fakePartial<InvocationManager>({}),
		});
		await registration.register(server);
		expect(outputSchema).toBeDefined();
		expect(jsonSchemaBytesOf(outputSchema)).toBeLessThanOrEqual(200);
	});
});
