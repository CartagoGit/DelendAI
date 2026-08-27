import z from 'zod';

import type { IToolSurfaceRuntimeAccess } from '../contracts/interfaces/tool-surface.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { ToolNotAuthorizedError } from '../project/tool-surface-runtime.helper';
import { toolError, toolJson } from '../shared/tool-response';

const ROUTER_RESULT = z.object({
	routed: z.literal(true),
	domain: z.string(),
	action: z.string(),
	tool: z.string(),
	active: z.boolean(),
	isError: z.boolean(),
	text: z.string().optional(),
	structuredContent: z.unknown().optional(),
});

export const buildVertexRouterToolRegistration = (input: {
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration => ({
	id: 'vertex',
	summary:
		'Compact router: resolve a domain + action to a loaded tool without exposing the full named surface.',
	tags: ['router', 'compact'],
	register: async (server) => {
		server.registerTool(
			`${input.namespacePrefix}_vertex`,
			{
				description:
					'Compact router over the loaded tool surface. Pass { domain, action, args } and it resolves the target from a typed registry built from the live tool catalog.',
				inputSchema: z.object({
					domain: z.string(),
					action: z.string(),
					args: z.record(z.string(), z.unknown()).optional(),
				}),
				outputSchema: ROUTER_RESULT,
			},
			async (
				args: {
					domain: string;
					action: string;
					args?: Readonly<Record<string, unknown>> | undefined;
				},
				extra,
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
				let result: unknown;
				try {
					result = await runtime.invokeTool(
						route.name,
						args.args ?? {},
						extra,
					);
				} catch (error) {
					if (error instanceof ToolNotAuthorizedError) {
						return toolError(
							error.message,
							'Call plugin_activate to re-authorize it, or tool_search to inspect the current surface.',
						);
					}
					throw error;
				}
				const structured =
					result && typeof result === 'object'
						? (result as { structuredContent?: unknown })
								.structuredContent
						: undefined;
				const text =
					result && typeof result === 'object'
						? (
								(result as { content?: unknown }).content as
									| Array<{ type?: string; text?: string }>
									| undefined
							)?.find((entry) => entry.type === 'text')?.text
						: undefined;
				return toolJson({
					routed: true,
					domain: args.domain,
					action: args.action,
					tool: route.name,
					active: route.active,
					isError:
						result && typeof result === 'object'
							? (result as { isError?: boolean }).isError === true
							: false,
					...(text !== undefined ? { text } : {}),
					...(structured !== undefined
						? { structuredContent: structured }
						: {}),
				});
			},
		);
	},
});
