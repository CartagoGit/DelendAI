/**
 * f00130 S1 — `api_call` tool.
 *
 * Parses an OpenAPI 3.x spec (provided inline or fetched from a
 * URL) and sends a single operation's request through the
 * allow-listed web-fetch engine. Pure planner over the parsed
 * spec + injected `fetch` seam; the test suite swaps the seam
 * so no real network is required.
 */
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';
import { webFetch, type IWebFetchResult } from '@mcp-vertex/web-fetch/public';

import { buildRequest, type IBuiltRequest } from '../spec/build-request';
import { parseOpenApi, fetchAndParseSpec } from '../spec/openapi';
import type { IOpenApiSpec, IOpenApiOperation } from '../spec/openapi';

export interface IApiCallToolOptions {
	readonly namespacePrefix: string;
	/**
	 * Optional pre-loaded spec. When supplied, the tool uses this
	 * directly (saving a fetch) — typical for tests + for hosts
	 * that pre-load the spec at register time.
	 */
	readonly spec?: IOpenApiSpec;
	/** Default `allowList` when the tool has to fetch a spec URL itself. */
	readonly defaultAllowList?: readonly string[];
	/**
	 * Allow callers to override the fetch implementation (tests
	 * inject a stub). Defaults to the shared `webFetch`.
	 */
	readonly fetchImpl?: typeof webFetch;
}

const INPUT = z
	.object({
		operationId: z.string().min(1).max(200),
		params: z
			.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
			.optional(),
		body: z.unknown().optional(),
		baseUrl: z.string().url().optional(),
		spec: z.unknown().optional(),
		specUrl: z.string().url().optional(),
		allowList: z.array(z.string()).min(1).optional(),
		timeoutMs: z.number().int().positive().optional(),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

const OUTPUT = z.object({
	request: z.object({
		method: z.enum([
			'GET',
			'POST',
			'PUT',
			'PATCH',
			'DELETE',
			'HEAD',
			'OPTIONS',
		]),
		url: z.string(),
		headers: z.record(z.string(), z.string()),
		body: z.string().optional(),
	}),
	response: z.object({
		ok: z.boolean(),
		status: z.number(),
		contentType: z.string().nullable(),
		body: z.string(),
		truncated: z.boolean(),
	}),
	specTitle: z.string(),
	parseNote: z.string(),
});

const REDACTED_HEADER_VALUE = '***';
const SENSITIVE_HEADER_NAMES = new Set([
	'authorization',
	'cookie',
	'set-cookie',
	'x-api-key',
	'api-key',
]);
const SENSITIVE_HEADER_SUBSTRINGS = ['token', 'secret'] as const;

const installHint = (
	reason: string,
	nextAction: string,
): ReturnType<typeof toolError> => toolError(reason, nextAction);

const isSensitiveHeaderName = (name: string): boolean => {
	const normalized = name.toLowerCase();
	if (SENSITIVE_HEADER_NAMES.has(normalized)) {
		return true;
	}
	return SENSITIVE_HEADER_SUBSTRINGS.some((part) =>
		normalized.includes(part),
	);
};

const redactRequestHeaders = (
	headers: Readonly<Record<string, string>>,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [
			name,
			isSensitiveHeaderName(name) ? REDACTED_HEADER_VALUE : value,
		]),
	);

/** `api_call` tool registration. */
export const buildApiCallToolRegistration = (
	options: IApiCallToolOptions,
): IToolRegistration => ({
	id: 'api_call',
	tags: ['api', 'openapi', 'network', 'effects'],
	summary: 'Build a request from an OpenAPI spec and send via web-fetch.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_api_call`,
			{
				description:
					'Send a single OpenAPI operation via the allow-listed web-fetch engine. The spec can be supplied inline (`spec`) or fetched from a URL (`specUrl` + `allowList`). Returns the rendered request + the response body + status. Auth comes from the request headers (build via `api_call` `params.header` for header tokens); secrets are never logged. Without a spec or specUrl the tool returns an actionable hint, never a crash.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args: z.infer<typeof INPUT>) => {
				let spec: IOpenApiSpec | undefined = options.spec;
				if (args.spec !== undefined) {
					spec = parseOpenApi(args.spec as object);
				} else if (args.specUrl !== undefined) {
					const allowList =
						args.allowList ?? options.defaultAllowList;
					if (allowList === undefined || allowList.length === 0) {
						return installHint(
							'specUrl requires an allowList.',
							'Pass `allowList: ["api.example.com"]` to the tool, or pre-load the spec via the plugin options.',
						);
					}
					const result = await fetchAndParseSpec({
						url: args.specUrl,
						allowList,
						...(args.maxBytes !== undefined
							? { maxBytes: args.maxBytes }
							: {}),
						...(args.timeoutMs !== undefined
							? { timeoutMs: args.timeoutMs }
							: {}),
					});
					spec = result.spec;
				}
				if (spec === undefined) {
					return installHint(
						'api_call needs a spec or specUrl.',
						'Pass `spec` (inline object) or `specUrl` (URL + allowList).',
					);
				}
				const operation: IOpenApiOperation | undefined =
					spec.operations[args.operationId];
				if (operation === undefined) {
					return installHint(
						`operationId "${args.operationId}" not in spec.`,
						`Available operations: ${Object.keys(spec.operations).join(', ') || '(none)'}.`,
					);
				}
				let request: IBuiltRequest | undefined;
				try {
					request = buildRequest({
						operation,
						specServers: spec.servers,
						...(args.params !== undefined
							? { params: args.params }
							: {}),
						...(args.body !== undefined ? { body: args.body } : {}),
						...(args.baseUrl !== undefined
							? { baseUrl: args.baseUrl }
							: {}),
					});
				} catch (error) {
					return installHint(
						`buildRequest failed: ${(error as Error).message}`,
						'Check the `params` / `body` against the operation schema.',
					);
				}
				const fetch = options.fetchImpl ?? webFetch;
				const allowList =
					args.allowList ?? options.defaultAllowList ?? [];
				if (allowList.length === 0) {
					return installHint(
						'api_call needs an allowList to dispatch the request.',
						'Pass `allowList: ["api.example.com"]` to the tool, or pre-load it via the plugin options.',
					);
				}
				const response: IWebFetchResult = await fetch({
					url: request.url,
					allowList,
					method: request.method,
					headers: request.headers,
					...(request.body !== undefined
						? { body: request.body }
						: {}),
					...(args.maxBytes !== undefined
						? { maxBytes: args.maxBytes }
						: {}),
					...(args.timeoutMs !== undefined
						? { timeoutMs: args.timeoutMs }
						: {}),
				});
				if (!response.ok) {
					return toolError(
						`webFetch rejected the request: ${response.reason}${response.detail !== undefined ? ` (${response.detail})` : ''}`,
						'Check the `allowList` and the `url`.',
					);
				}
				const outputRequest = {
					method: request.method,
					url: request.url,
					headers: redactRequestHeaders(request.headers),
					...(request.body !== undefined
						? { body: request.body }
						: {}),
				};
				return toolJson({
					request: outputRequest,
					response: {
						ok: response.ok,
						status: response.status,
						contentType: response.contentType,
						body: response.body,
						truncated: response.truncated,
					},
					specTitle: spec.title,
					parseNote: spec.parseNote,
				});
			},
		);
	},
});
