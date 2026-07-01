import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { webFetch } from '../services/engine';
import type { IFetchLike } from '../services/engine';

export interface IWebToolOptions {
	readonly namespacePrefix: string;
	/** Hostnames (exact or `*.suffix` wildcard) `web_fetch` may reach. Empty = fetch nothing. */
	readonly allowList: readonly string[];
	/** Injectable for tests; defaults to the real network fetch. */
	readonly fetchImpl?: IFetchLike;
}

// The MCP SDK's `outputSchema` only accepts a plain `z.object({...})` shape
// (`normalizeObjectSchema` in the SDK's zod-compat layer special-cases
// objects only — a `z.discriminatedUnion` has no top-level `.shape` and
// silently fails output validation at call time with an internal SDK error,
// not a Zod validation error). Model the success/failure branches as one
// flat optional-field object instead, matching the convention every other
// tool in this repo already uses (see `buildMetricsToolRegistration` /
// `buildDocsToolRegistrations`, both plain `z.object` with optional fields).
const OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	url: z.string().optional(),
	status: z.number().optional(),
	contentType: z.string().nullable().optional(),
	body: z.string().optional(),
	truncated: z.boolean().optional(),
	reason: z
		.enum([
			'blocked-host',
			'invalid-url',
			'redirect-blocked',
			'too-many-redirects',
			'timeout',
			'fetch-error',
		])
		.optional(),
	detail: z.string().optional(),
});

/**
 * Opt-in `web_fetch` tool: resolve one allow-listed URL and return its
 * (capped) text body. `effects: ['network']` is declared explicitly — the
 * plugin is opt-in (not in any preset) precisely because this is the one
 * tool in the swarm that reaches outside the workspace.
 */
export const buildWebToolRegistrations = (
	options: IWebToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'web_fetch',
			summary:
				'Fetch one allow-listed URL and return capped text (opt-in, network).',
			tags: ['web', 'network'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_web_fetch`,
					{
						description:
							'Fetch one URL and return its text body, capped at 50 KiB by default. The URL\'s hostname must match `plugins.web.options.allowList` (exact or `*.suffix` wildcard) or the call is rejected with reason "blocked-host". Redirects are followed manually and each hop is re-checked against the allow-list (reason "redirect-blocked" if a hop escapes it). Opt-in, `effects: ["network"]`.',
						inputSchema: z.object({
							url: z.string(),
							maxBytes: z.number().optional(),
							timeoutMs: z.number().optional(),
						}),
						outputSchema: OUTPUT_SCHEMA,
					},
					async (args: {
						url: string;
						maxBytes?: number | undefined;
						timeoutMs?: number | undefined;
					}) => {
						const result = await webFetch(
							{
								url: args.url,
								allowList: options.allowList,
								...(args.maxBytes !== undefined
									? { maxBytes: args.maxBytes }
									: {}),
								...(args.timeoutMs !== undefined
									? { timeoutMs: args.timeoutMs }
									: {}),
							},
							options.fetchImpl,
						);
						return toolJson(result);
					},
				);
			},
		},
	];
};
