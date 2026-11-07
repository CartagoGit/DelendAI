/**
 * advise-spend.tool.spec.ts — v00130 (AUD-B01) regression pin.
 *
 * `advise_spend` used to declare its full, exported
 * `AdviseSpendOutputSchema` as the wire `outputSchema` (~5.52 KB in the
 * `vertex` preset). It now declares `compactOutputSchema()` instead.
 * `AdviseSpendOutputSchema` is not used as a runtime response validator
 * anywhere in `advise-spend.tool.ts` (verified by inspection — the only
 * `JSON.parse` in that file is of the `usage-tracking` rollup document on
 * disk, an unrelated INPUT, not a validation of this handler's own
 * output), so there is no separate internal schema to preserve; it stays
 * exported from `schemas.ts` purely for callers/consumers, unrelated to
 * this test. This fails the day the declared schema regrows.
 *
 * (`buildSpendAdvice`/`readSpendState`/behavioural coverage for the real
 * response shape already lives in `advise-spend.spec.ts` — untouched by
 * this change and not duplicated here.)
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit/public';

import { buildAdviseSpendRegistration } from '../../../../src/lib/tools/advise-spend.tool';

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

describe('advise_spend tool', () => {
	it('declares a compact outputSchema, not the full AdviseSpendOutputSchema shape', async () => {
		let outputSchema: unknown;
		const server = createFakeToolServer({
			onRegisterTool: (call) => {
				outputSchema = (call.config as { outputSchema?: unknown })
					.outputSchema;
			},
		});
		const registration = buildAdviseSpendRegistration({
			namespacePrefix: 'mcp',
			usageSummaryPath:
				'/tmp/does-not-need-to-exist-for-registration.json',
		});
		await registration.register(server);
		expect(outputSchema).toBeDefined();
		expect(jsonSchemaBytesOf(outputSchema)).toBeLessThanOrEqual(200);
	});
});
