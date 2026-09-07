import z from 'zod';

import type { IToolSurfaceRuntimeAccess } from '../contracts/interfaces/tool-surface.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { resolveAndInvoke } from '../dispatch/capability-resolver';
import {
	injectToolResultMeta,
	toolError,
	toolJson,
} from '../shared/tool-response';

const ROUTER_RESULT = z.looseObject({
	routed: z.literal(true).optional(),
	domain: z.string().optional(),
	action: z.string().optional(),
	tool: z.string().optional(),
	active: z.boolean().optional(),
	isError: z.boolean().optional(),
	text: z.string().optional(),
	structuredContent: z.unknown().optional(),
	ok: z.literal(false).optional(),
	error: z
		.object({
			reason: z.string(),
			nextAction: z.string().optional(),
		})
		.optional(),
});

/**
 * Compact router handler — the pure routing logic, parameterised by
 * the runtime access port. Extracted from
 * `buildCompactRouterToolRegistration` so the handler is testable in
 * isolation and so the router's behaviour can be reused (or wrapped)
 * by other tools without going through the MCP registration surface.
 *
 * x00519 / b00239 migration: the canonical tool id is now
 * `compact_router` / `delendai_compact_router` (matching the file
 * name). The legacy brand prefix was retired entirely — there is no
 * soft alias. The lint `i18n-english-prose.script.ts` flags any live
 * occurrence as a regression.
 */
const compactRouterHandler =
	(input: { runtimeAccess: IToolSurfaceRuntimeAccess }) =>
	async (
		args: {
			domain: string;
			action: string;
			args?: Readonly<Record<string, unknown>> | undefined;
		},
		extra: unknown,
	) => {
		const runtime = input.runtimeAccess.get();
		if (runtime === undefined) {
			return toolError(
				'Tool surface runtime is not initialized yet.',
				'Retry once the server has finished booting.',
			);
		}
		const route = runtime.resolveRoute(args.domain, args.action);
		if (route === undefined) {
			return toolError(
				`No routed tool matches ${args.domain}.${args.action}.`,
				'Call tool_search to inspect the loaded domains and actions.',
			);
		}
		const resolved = await resolveAndInvoke(
			input.runtimeAccess,
			{
				domain: args.domain,
				action: args.action,
				...(args.args !== undefined ? { args: args.args } : {}),
			},
			extra,
		);
		if (resolved.status === 'terminal') {
			const reason =
				resolved.reason === 'policy_denied'
					? `Tool "${resolved.capability ?? route.name}" is deactivated and cannot be invoked. Call plugin_activate to re-authorize it.`
					: resolved.detail;
			const nextAction =
				resolved.reason === 'policy_denied'
					? 'Call plugin_activate to re-authorize it, or tool_search to inspect the current surface.'
					: resolved.nextAction ??
						'Call tool_search to inspect the current surface.';
			return toolError(
				reason,
				nextAction,
			);
		}
		const result = resolved.result;
		const structured =
			result && typeof result === 'object'
				? (result as { structuredContent?: unknown }).structuredContent
				: undefined;
		const text =
			result && typeof result === 'object'
				? (
						(result as { content?: unknown }).content as
							| Array<{ type?: string; text?: string }>
							| undefined
					)?.find((entry) => entry.type === 'text')?.text
				: undefined;
		const routedResult = toolJson({
			routed: true,
			domain: args.domain,
			action: args.action,
			tool: resolved.toolName,
			active: resolved.access === 'visible',
			isError:
				result && typeof result === 'object'
					? (result as { isError?: boolean }).isError === true
					: false,
			...(text !== undefined ? { text } : {}),
			...(structured !== undefined
				? { structuredContent: structured }
				: {}),
		});
		const innerMeta =
			result && typeof result === 'object'
				? (result as { _meta?: unknown })._meta
				: undefined;
		if (
			innerMeta !== null &&
			typeof innerMeta === 'object' &&
			!Array.isArray(innerMeta)
		) {
			injectToolResultMeta(
				routedResult,
				innerMeta as Record<string, unknown>,
			);
		}
		if (
			result &&
			typeof result === 'object' &&
			(result as { isError?: boolean }).isError === true
		) {
			routedResult.isError = true;
		}
		return routedResult;
	};

const ROUTER_DESCRIPTION =
	'Compact router over the loaded tool surface. Pass { domain, action, args } and it resolves the target from a typed registry built from the live tool catalog.';

const ROUTER_INPUT_SCHEMA = z.object({
	domain: z.string(),
	action: z.string(),
	args: z.record(z.string(), z.unknown()).optional(),
});

export const buildCompactRouterToolRegistration = (input: {
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration => ({
	id: 'compact_router',
	summary:
		'Compact router: resolve a domain + action to a loaded tool without exposing the full named surface.',
	tags: ['router', 'compact'],
	register: async (server) => {
		// Single canonical registration. The previous brand
		// prefix was retired in the b00239 migration — every in-tree
		// call site, smoke script, and measurement harness now
		// targets this name directly. New hosts MUST call
		// `${prefix}_compact_router`.
		server.registerTool(
			`${input.namespacePrefix}_compact_router`,
			{
				description: ROUTER_DESCRIPTION,
				inputSchema: ROUTER_INPUT_SCHEMA,
				outputSchema: ROUTER_RESULT,
			},
			compactRouterHandler(input),
		);
	},
});
