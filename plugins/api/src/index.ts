/**
 * f00130 — `api` plugin entry point.
 *
 * S1 (spec parse + request build): `api_call` parses an OpenAPI
 * 3.x spec (inline or fetched from a URL) and dispatches a single
 * operation through the allow-listed web-fetch engine.
 * S2 (contract validation) and S3 (mock + catalog) are tracked
 * separately under f00130.
 */
import apiPackageJson from '../package.json';
import z from 'zod';

import { definePlugin, resolvePresetMembers } from '@mcp-vertex/core/public';

import { buildApiCallToolRegistration } from './lib/tools/api-call.tool';
import { buildApiMockToolRegistration } from './lib/tools/api-mock.tool';
import { buildApiValidateToolRegistrations } from './lib/tools/api-validate.tool';

const formatPluginList = (plugins: readonly string[]): string => {
	if (plugins.length === 0) return '';
	if (plugins.length === 1) return `\`${plugins[0]}\``;
	if (plugins.length === 2) return `\`${plugins[0]}\` and \`${plugins[1]}\``;
	return `${plugins
		.slice(0, -1)
		.map((plugin) => `\`${plugin}\``)
		.join(', ')}, and \`${plugins.at(-1)}\``;
};

const backendApiPackMembershipLine = (): string => {
	const members = resolvePresetMembers('backend-api');
	return `- \`backend-api\` — the preset currently ships ${formatPluginList(members)}; it does not include \`api\` by default.`;
};

const OptionsSchema = z
	.object({
		defaultAllowList: z.array(z.string()).optional(),
	})
	.optional();

export default definePlugin({
	name: 'api',
	version: apiPackageJson.version,
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
				...buildApiValidateToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(opts?.defaultAllowList === undefined
						? {}
						: { defaultAllowList: opts.defaultAllowList }),
				}),
				buildApiMockToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					...(opts?.defaultAllowList === undefined
						? {}
						: { defaultAllowList: opts.defaultAllowList }),
				}),
			],
			knowledge: [
				{
					id: 'api-validate-overview',
					title: 'api_validate',
					body: [
						'# api_validate',
						'',
						'Validate a decoded JSON response against the OpenAPI success response schema for one operation.',
						'',
						'- Inputs: `operationId`, `response`, and either `spec` or `specUrl` + `allowList`.',
						'- Output: normalized findings plus severity summary and worst severity.',
						'- Coverage: required fields, type drift, enum drift, email/uri format checks, nullable fields, nested arrays/objects, and closed-object extra properties.',
					].join('\n'),
				},
				{
					id: 'api-mock-overview',
					title: 'api_mock',
					body: [
						'# api_mock',
						'',
						'Generate a deterministic example response for one OpenAPI operation directly from the parsed spec — no live server, no network. Useful for local development, contract-test seeds and documentation stubs.',
						'',
						'- Inputs: `operationId` (required) or `method` + `path`, plus either `spec` or `specUrl` + `allowList`.',
						'- Optional `statusCode` picks a specific response (default: the first 2xx or `default`).',
						'- Optional `count` generates a list of `count` unique mocks (default 1).',
						'- Deterministic by default; pass `randomize: true` to mix the operationId + path + status into the seed between calls.',
						'- Output: `{ ok, operationId, response }` where `response` carries the chosen status, content type, and the generated body that satisfies the spec.',
					].join('\n'),
				},
				{
					id: 'api-plugin-catalog',
					title: 'api plugin catalog',
					body: [
						'# api plugin catalog',
						'',
						'OpenAPI-aware request building, contract validation, and mock generation on top of the allow-listed web-fetch engine.',
						'',
						'## Tools',
						'- `api_call` — parse spec, build a request, dispatch through the allow-listed web-fetch engine.',
						'- `api_validate` — check a decoded JSON response against the success response schema for one operation.',
						'- `api_mock` — generate a deterministic example response for one operation from the spec (no network).',
						'',
						'## Pack membership',
						backendApiPackMembershipLine(),
						'',
						'## Engine',
						'- All operations ride the shared `web-fetch` allow-list. Mutating calls require the same consent web-fetch demands.',
						'- The S1 parser, S2 schema walker, and S3 mock generator share the same `IJsonSchema` shape — no parallel contracts.',
					].join('\n'),
				},
			],
		};
	},
});
