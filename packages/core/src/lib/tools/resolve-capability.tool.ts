/**
 * Generic, always-visible capability primitive.
 *
 * This is the canonical entry point for hosts that
 * (a) have not refreshed `tools/list` after a `plugin_activate`, or
 * (b) cannot honour `tools/list_changed` and must dispatch through
 *     a tool they ALWAYS see.
 *
 * x00512 / S4. The primitive delegates entirely to the generic
 * `CapabilityResolver` (`../dispatch/capability-resolver`); it
 * contains **no** domain-specific knowledge, no plugin ids, and no
 * hardcoded tool names. Hosts add this single tool to their
 * bootstrap surface and lose nothing.
 *
 * The tool's input accepts the resolver's two identification shapes:
 *
 *   { qualifiedName: "delendai_..." }   // exact canonical name
 *   { domain: "...", action: "..." }   // semantic routing tuple
 *
 * Output is the resolver's discriminated union:
 *
 *   { status: "ok", toolName, pluginId?, domain?, action?, access,
 *     result }    // tool-result envelope is preserved
 *   { status: "terminal", reason, detail, request, capability?,
 *     nextAction? }    // six-discriminator terminal errors
 *
 * The terminal reason is one of:
 *
 *   catalog_missing | policy_denied | host_read_only |
 *   activation_failed | argument_validation_failed |
 *   execution_failed
 *
 * Invariant: NO terminal reason is ever "disabled" / "not available"
 * / "not loaded". Internal lazy-load states stay internal and are
 * recovered transparently by the resolver (auto-activating the owning
 * plugin via the single-flight `runtime.activatePluginAsync`).
 */

import z from 'zod';

import type { IToolSurfaceRuntimeAccess } from '../contracts/interfaces/tool-surface.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import {
	isResolverOk,
	resolveAndInvoke,
} from '../dispatch/capability-resolver';
import type {
	IResolveCapabilityInput,
	IResolveCapabilityResult,
} from '../dispatch/capability-resolver';
import { toolJson, type IToolTextResult } from '../shared/tool-response';

const RESOLVE_CAPABILITY_INPUT = z
	.object({
		qualifiedName: z.string().min(1).optional(),
		domain: z.string().min(1).optional(),
		action: z.string().min(1).optional(),
		args: z.record(z.string(), z.unknown()).optional(),
	})
	.refine(
		(value) =>
			value.qualifiedName !== undefined ||
			(value.domain !== undefined && value.action !== undefined),
		{
			message:
				'Provide either `qualifiedName` OR both `domain` and `action`.',
		},
	);

const RESOLVE_CAPABILITY_OUTPUT = z.union([
	z.object({
		status: z.literal('ok'),
		toolName: z.string(),
		pluginId: z.string().optional(),
		domain: z.string().optional(),
		action: z.string().optional(),
		access: z.enum(['visible', 'hidden']),
		result: z.unknown(),
	}),
	z.object({
		status: z.literal('terminal'),
		reason: z.enum([
			'catalog_missing',
			'policy_denied',
			'host_read_only',
			'activation_failed',
			'argument_validation_failed',
			'execution_failed',
		]),
		detail: z.string(),
		request: z.record(z.string(), z.unknown()),
		capability: z.string().optional(),
		nextAction: z.string().optional(),
	}),
]);

/**
 * Pure handler — extracted so the resolver wiring is unit-testable
 * without going through the MCP registration surface. The handler
 * validates the input shape defensively (the resolver also checks,
 * but pre-validation gives a tighter error message for well-formed
 * calls).
 */
const buildResolveCapabilityHandler =
	(input: { readonly runtimeAccess: IToolSurfaceRuntimeAccess }) =>
	async (args: unknown, extra: unknown): Promise<IToolTextResult> => {
		const parsed = RESOLVE_CAPABILITY_INPUT.safeParse(args);
		if (!parsed.success) {
			const message = parsed.error.issues
				.map((issue) => issue.message)
				.join('; ');
			return toolJson({
				status: 'terminal',
				reason: 'argument_validation_failed',
				detail:
					message.length > 0
						? message
						: 'The capability resolve input was malformed.',
				request: {},
			});
		}
		const value: IResolveCapabilityInput = {
			...(parsed.data.qualifiedName !== undefined
				? { qualifiedName: parsed.data.qualifiedName }
				: {}),
			...(parsed.data.domain !== undefined
				? { domain: parsed.data.domain }
				: {}),
			...(parsed.data.action !== undefined
				? { action: parsed.data.action }
				: {}),
			...(parsed.data.args !== undefined
				? { args: parsed.data.args }
				: {}),
		};
		const outcome: IResolveCapabilityResult = await resolveAndInvoke(
			input.runtimeAccess,
			value,
			extra,
		);
		if (isResolverOk(outcome)) {
			return toolJson({
				status: 'ok',
				toolName: outcome.toolName,
				...(outcome.pluginId !== undefined
					? { pluginId: outcome.pluginId }
					: {}),
				...(outcome.domain !== undefined
					? { domain: outcome.domain }
					: {}),
				...(outcome.action !== undefined
					? { action: outcome.action }
					: {}),
				access: outcome.access,
				result: outcome.result,
			});
		}
		const errorBlock: Record<string, unknown> = {
			status: 'terminal',
			reason: outcome.reason,
			detail: outcome.detail,
			request: outcome.request,
		};
		if (outcome.capability !== undefined) {
			errorBlock.capability = outcome.capability;
		}
		if (outcome.nextAction !== undefined) {
			errorBlock.nextAction = outcome.nextAction;
		}
		return toolJson(errorBlock);
	};

/**
 * Register the always-visible capability resolver primitive.
 *
 * The runtime's `shouldExpose` makes this tool reachable in every
 * surface mode because its registration id is added to the canonical
 * `BOOTSTRAP_CORE_TOOL_IDS` constant (see
 * `contracts/constants/bootstrap-core-tool-ids.constant.ts`).
 */
export const buildResolveCapabilityToolRegistration = (input: {
	readonly namespacePrefix: string;
	readonly runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration => ({
	id: 'resolve_capability',
	tags: ['resolver', 'capability', 'bootstrap'],
	summary:
		'Generic capability resolver: invoke any registered capability via its qualified name OR a (domain, action) tuple. Hidden or lazy-loaded tools are activated transparently; terminal errors use the discriminated reason vocabulary (catalog_missing | policy_denied | host_read_only | activation_failed | argument_validation_failed | execution_failed).',
	register: async (server) => {
		server.registerTool(
			`${input.namespacePrefix}_resolve_capability`,
			{
				description:
					'Generic, always-visible capability resolver. Accepts `{ qualifiedName }` or `{ domain, action, args? }` and returns the resolver result envelope. Internal lazy-load states are recovered transparently — a tool that exists in the catalog is always callable, regardless of whether it is currently in `tools/list`.',
				inputSchema: RESOLVE_CAPABILITY_INPUT,
				outputSchema: RESOLVE_CAPABILITY_OUTPUT,
			},
			buildResolveCapabilityHandler({
				runtimeAccess: input.runtimeAccess,
			}),
		);
	},
});
