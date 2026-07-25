/**
 * f00130 — `api` plugin entry point.
 *
 * S1 (spec parse + request build): `api_call` parses an OpenAPI
 * 3.x spec (inline or fetched from a URL) and dispatches a single
 * operation through the allow-listed web-fetch engine.
 * S2 (contract validation) and S3 (mock + catalog) are tracked
 * separately under f00130.
 */
import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildApiCallToolRegistration } from './lib/tools/api-call.tool';

const OptionsSchema = z
	.object({
		defaultAllowList: z.array(z.string()).optional(),
	})
	.optional();

export default definePlugin({
	name: 'api',
	version: '0.1.0',
	describe:
		'OpenAPI-aware request building, contract validation and mocking on top of the allow-listed web-fetch engine. Read by default; mutating calls require the same consent web-fetch demands.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`api plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		return {
			tools: [
				buildApiCallToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					...(opts?.defaultAllowList === undefined
						? {}
						: { defaultAllowList: opts.defaultAllowList }),
				}),
			],
		};
	},
});
