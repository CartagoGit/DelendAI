/**
 * advise-routing.tool.spec.ts — v00130 (AUD-B01) regression pin.
 *
 * `advise_routing` used to declare its full, exported
 * `AdviseRoutingOutputSchema` as the wire `outputSchema` (~7.97 KB in the
 * `vertex` preset). It now declares `compactOutputSchema()` instead.
 * `AdviseRoutingOutputSchema` is not used as a runtime response validator
 * anywhere in `advise-routing.tool.ts` (verified by inspection — no
 * `.parse()`/`.safeParse()` of it against the handler's return value), so
 * there is no separate internal schema to preserve; it stays exported from
 * `schemas.ts` purely for callers/consumers, unrelated to this test. This
 * fails the day the declared schema regrows.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@mcp-vertex/test-kit/public';

import { buildAdviseRoutingRegistration } from '../../../../src/lib/tools/advise-routing.tool';
import type { SessionStore } from '../../../../src/lib/router/session';
import type { HealthStore } from '../../../../src/lib/healthcheck/store';

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

describe('advise_routing tool', () => {
	it('declares a compact outputSchema, not the full AdviseRoutingOutputSchema shape', async () => {
		let outputSchema: unknown;
		const server = createFakeToolServer({
			onRegisterTool: (call) => {
				outputSchema = (call.config as { outputSchema?: unknown })
					.outputSchema;
			},
		});
		const registration = buildAdviseRoutingRegistration({
			namespacePrefix: 'mcp',
			providers: [],
			health: fakePartial<HealthStore>({}),
			sessions: fakePartial<SessionStore>({}),
			defaultCostPreference: 'balanced',
		});
		await registration.register(server);
		expect(outputSchema).toBeDefined();
		expect(jsonSchemaBytesOf(outputSchema)).toBeLessThanOrEqual(200);
	});
});
