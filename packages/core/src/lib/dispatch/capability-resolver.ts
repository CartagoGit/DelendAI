/**
 * CapabilityResolver — generic, lazy-loader-agnostic, domain-agnostic.
 *
 * The resolver receives a capability request from any source (the
 * `delendai_compact_router`, a host-agnostic `resolve_and_invoke`
 * primitive, or a regression test) and returns one of:
 *
 *   - a successful tool result  (`status: 'ok'`, with the underlying
 *     tool's structured/text content), or
 *   - a discriminated terminal error  (`status: 'terminal'`, one of
 *     `catalog_missing | policy_denied | host_read_only |
 *      activation_failed | argument_validation_failed |
 *      execution_failed`, see `capability-resolver.error.ts`).
 *
 * The resolver NEVER reports a recoverable internal state
 * (`unloaded`, `pending`, `hidden`) as a terminal outcome. A hidden
 * tool stays callable: the runtime's own `invokeTool` path knows how
 * to materialize a lazy binding for that one tool without widening
 * `tools/list`. Administrative deactivation is different and is
 * surfaced as `policy_denied`.
 *
 * x00512 / S1.
 *
 * INVARIANTS (see x00512 §Invariants):
 * - I1: lazy decides WHEN, not IF.
 * - I2: internal states stay internal; only terminal errors cross the wire.
 * - I5: no hardcoded plugin / tool / skill identifiers in this module.
 *       Everything is discovered via the supplied runtime's catalog
 *       access methods (`resolveRoute`, `getToolExposure`, `searchTools`).
 *
 * The module is split into:
 * - `capability-resolver.error.ts` — discriminated error envelope.
 * - `capability-resolver.identity.ts` — identity / runtime access / request helpers.
 * - `capability-resolver.ts` (this file) — orchestration: shape the input,
 *   call `resolveIdentity`, ensure activation, invoke, format the result.
 */

import type {
	IToolSurfaceRuntime,
	IToolSurfaceRuntimeAccess,
} from '../contracts/interfaces/tool-surface.interface';

import {
	resolverError,
	type IResolverError,
} from './capability-resolver.error';
import {
	resolveIdentity,
	readRuntime,
	toRequestRecord,
} from './capability-resolver.identity';

/**
 * The input the resolver accepts.
 *
 * Two disjoint identification shapes:
 * - `{ qualifiedName }` — the canonical MCP tool name the host would
 *   issue.
 * - `{ domain, action }` — the routing tuple, useful when the caller
 *   knows intent but not the qualified name.
 *
 * At least one of `(qualifiedName)` or `(domain, action)` must be
 * supplied. If both are supplied, `qualifiedName` is consulted first.
 */
export interface IResolveCapabilityInput {
	readonly qualifiedName?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
	readonly args?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Successful resolution. The `toolName` echoes the canonical qualified
 * name so the LLM does not have to remember which shape it asked in.
 */
export interface IResolveCapabilityOk {
	readonly status: 'ok';
	readonly toolName: string;
	readonly pluginId?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
	readonly access: 'visible' | 'hidden';
	readonly result: unknown;
}

export type IResolveCapabilityResult = IResolveCapabilityOk | IResolverError;

export const isResolverOk = (
	value: IResolveCapabilityResult,
): value is IResolveCapabilityOk => value.status === 'ok';

export type { IResolverError } from './capability-resolver.error';

/**
 * Invoke the resolved capability. Wraps the runtime's `invokeTool`
 * (which already enforces authorization + lazy-handler binding) and
 * shapes thrown errors into the resolver's terminal-error envelope.
 *
 * The runtime throws `ToolNotAuthorizedError` when the access state
 * is `'deactivated'`. That is converted here to `policy_denied` —
 * not to an "internal" state marker.
 */
const invokeResolved = async (params: {
	runtime: IToolSurfaceRuntime;
	toolName: string;
	args: Readonly<Record<string, unknown>> | undefined;
	extra: unknown;
	request: Readonly<Record<string, unknown>>;
	pluginId?: string | undefined;
	domain?: string | undefined;
	action?: string | undefined;
	access: 'visible' | 'hidden';
}): Promise<IResolveCapabilityResult> => {
	const {
		runtime,
		toolName,
		args,
		extra,
		request,
		pluginId,
		domain,
		action,
		access,
	} = params;

	const exposure = runtime.getToolExposure(toolName);
	if (exposure === 'unknown') {
		return resolverError({
			reason: 'catalog_missing',
			detail: `Capability "${toolName}" is not registered in the runtime catalog after resolution.`,
			request,
			capability: toolName,
		});
	}

	try {
		const result = await runtime.invokeTool(toolName, args ?? {}, extra);
		const ok: IResolveCapabilityOk = {
			status: 'ok',
			toolName,
			access,
			result,
			...(pluginId !== undefined ? { pluginId } : {}),
			...(domain !== undefined ? { domain } : {}),
			...(action !== undefined ? { action } : {}),
		};
		return ok;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		const isUnauthorized =
			error !== null &&
			typeof error === 'object' &&
			'name' in error &&
			(error as { name?: unknown }).name === 'ToolNotAuthorizedError';
		const isActivationError =
			error !== null &&
			typeof error === 'object' &&
			'name' in error &&
			(error as { name?: unknown }).name === 'ToolActivationError';
		if (isUnauthorized) {
			return resolverError({
				reason: 'policy_denied',
				detail: `Capability "${toolName}" is administratively deactivated. The lazy-load state does not block this; an explicit policy decision does.`,
				request,
				capability: toolName,
				nextAction:
					'The operator may re-authorize the capability via `delendai_plugin_activate`.',
			});
		}
		if (isActivationError) {
			return resolverError({
				reason: 'activation_failed',
				detail: `Capability "${toolName}" activation failed: ${message}`,
				request,
				capability: toolName,
			});
		}
		return resolverError({
			reason: 'execution_failed',
			detail: `Capability "${toolName}" execution threw: ${message}`,
			request,
			capability: toolName,
		});
	}
};

/**
 * Resolve AND invoke a capability in one call.
 *
 * This is the canonical entry point for hosts that do not need the
 * LLM to know about `tool_search` / `plugin_activate`. The signature
 * is intentionally small so it can be wrapped by:
 * - `delendai_compact_router` (route forwarding)
 * - `delendai_resolve_capability` (always-visible primitive)
 * - direct calls from MCP-adapter tests
 *
 * Concurrency: the runtime's activation is already single-flight per
 * `pluginId` (x00512 S2), and `invokeTool` waits for any concurrent
 * disposal to settle.
 */
export const resolveAndInvoke = async (
	runtimeAccess: IToolSurfaceRuntimeAccess,
	input: IResolveCapabilityInput,
	extra: unknown,
): Promise<IResolveCapabilityResult> => {
	const request = toRequestRecord(input);
	if (
		input.qualifiedName === undefined &&
		(input.domain === undefined || input.action === undefined)
	) {
		return resolverError({
			reason: 'argument_validation_failed',
			detail: 'Capability resolve input must include either `qualifiedName` or both `domain` and `action`.',
			request,
		});
	}

	const rt = readRuntime(runtimeAccess);
	if (rt.kind === 'not_initialized') {
		return resolverError({
			reason: 'host_read_only',
			detail: 'Tool surface runtime is not initialised yet; the MCP server is still booting.',
			request,
			nextAction:
				'Retry the capability invocation once the host reports ready.',
		});
	}
	const runtime = rt.runtime;

	const identity = resolveIdentity(runtime, input);
	if (identity === undefined) {
		return resolverError({
			reason: 'catalog_missing',
			detail: 'No capability matches the supplied identifier. The capability is not registered in the runtime catalog.',
			request,
		});
	}

	// Internal lazy-load states (`hidden`) recover transparently via
	// the runtime's single-flight activation. Administrative state
	// (`deactivated`) does NOT — `invokeTool` throws
	// `ToolNotAuthorizedError`, mapped to `policy_denied` below.
	if (identity.access === 'deactivated') {
		return resolverError({
			reason: 'policy_denied',
			detail: `Capability "${identity.toolName}" is administratively deactivated. The lazy-load state does not block this; an explicit policy decision does.`,
			request,
			capability: identity.toolName,
			nextAction:
				'The operator may re-authorize the capability via `delendai_plugin_activate`.',
		});
	}

	return invokeResolved({
		runtime,
		toolName: identity.toolName,
		args: input.args,
		extra,
		request,
		access: identity.access,
		...(identity.pluginId !== undefined
			? { pluginId: identity.pluginId }
			: {}),
		...(identity.domain !== undefined ? { domain: identity.domain } : {}),
		...(identity.action !== undefined ? { action: identity.action } : {}),
	});
};
