/**
 * CapabilityResolver — identity resolution helpers.
 *
 * x00512 / S1. Pure helpers extracted from the resolver so the main
 * module keeps the SRP single-responsibility surface (resolve
 * identity, ensure activation, invoke, shape the error envelope). The
 * identity helpers answer "given the request, what canonical tool
 * name does it map to?" — nothing about activation, invocation, or
 * error taxonomy.
 *
 * No plugin / tool / skill identifiers are hardcoded. Discovery walks
 * the runtime's public catalog surface (`searchTools`,
 * `resolveRoute`, `getToolExposure`).
 */

import type { IToolSurfaceRuntime } from '../contracts/interfaces/tool-surface.interface';

/**
 * Identity of a resolved capability. The `access` field is the
 * effective runtime state at the moment of resolution — `'visible'`
 * for tools the catalog currently advertises, `'hidden'` for tools
 * behind a lazy or progressive-disclosure tier. `'deactivated'` is
 * NOT a value here; the resolver learns that policy bit by catching
 * the runtime's `ToolNotAuthorizedError` during `invokeTool`.
 */
export interface IResolvedIdentity {
	readonly toolName: string;
	readonly pluginId?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
	readonly access: 'visible' | 'hidden';
}

/**
 * Find the catalog entry that owns `qualifiedName`, if any. Uses the
 * runtime's `searchTools` so it works against the public catalog
 * surface (no special access to internals). The match is exact on the
 * qualified name AND on the bare `toolId`, since the LLM may have
 * supplied either form.
 */
const findByQualifiedName = (
	runtime: IToolSurfaceRuntime,
	qualifiedName: string,
):
	| {
			readonly pluginId?: string;
			readonly access: 'visible' | 'hidden';
	  }
	| undefined => {
	const matches = runtime.searchTools({ query: qualifiedName });
	const found = matches.find(
		(entry) =>
			entry.name === qualifiedName || entry.toolId === qualifiedName,
	);
	if (found === undefined) return undefined;
	return {
		...(found.pluginId !== undefined ? { pluginId: found.pluginId } : {}),
		access: found.active ? 'visible' : 'hidden',
	};
};

/**
 * Resolve the capability identity. Tries `qualifiedName` first, then
 * `domain + action`. Returns `undefined` when neither lookup succeeds
 * (a recoverable miss — the caller distinguishes `catalog_missing`).
 */
export const resolveIdentity = (
	runtime: IToolSurfaceRuntime,
	input: {
		readonly qualifiedName?: string | undefined;
		readonly domain?: string | undefined;
		readonly action?: string | undefined;
	},
): IResolvedIdentity | undefined => {
	if (input.qualifiedName !== undefined && input.qualifiedName.length > 0) {
		const found = findByQualifiedName(runtime, input.qualifiedName);
		if (found !== undefined) {
			return {
				toolName: input.qualifiedName,
				pluginId: found.pluginId,
				access: found.access,
			};
		}
		// Continue to the fallback. `qualifiedName` not in catalog is
		// NOT a hard error yet — the LLM might have given a router
		// qualifier (e.g. `proposals.create_proposal`) that the
		// domain/action lookup can still honour.
	}

	if (input.domain !== undefined && input.action !== undefined) {
		const route = runtime.resolveRoute(input.domain, input.action);
		if (route !== undefined) {
			const exposure = runtime.getToolExposure(route.name);
			if (exposure === 'visible' || exposure === 'hidden') {
				return {
					toolName: route.name,
					pluginId: route.pluginId,
					domain: input.domain,
					action: input.action,
					access: exposure,
				};
			}
		}
	}

	return undefined;
};

/**
 * Read the runtime out of the access port. The runtime may briefly
 * be `undefined` if the server is still booting — that is a real
 * terminal state the LLM should see, not an "internal" one.
 */
export const readRuntime = (runtimeAccess: {
	get(): IToolSurfaceRuntime | undefined;
}):
	| { kind: 'ok'; runtime: IToolSurfaceRuntime }
	| { kind: 'not_initialized' } =>
	runtimeAccess.get() === undefined
		? { kind: 'not_initialized' }
		: { kind: 'ok', runtime: runtimeAccess.get() as IToolSurfaceRuntime };

/**
 * Normalize the request input into a single canonical record. The
 * record is echoed back in the terminal error envelope (`request`
 * field) so the resolver-result is self-describing even if the
 * resolver forgets to thread individual fields through to the error
 * factory.
 */
export const toRequestRecord = (input: {
	readonly qualifiedName?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
}): Readonly<Record<string, unknown>> => {
	const request: Record<string, unknown> = {};
	if (input.qualifiedName !== undefined)
		request.qualifiedName = input.qualifiedName;
	if (input.domain !== undefined) request.domain = input.domain;
	if (input.action !== undefined) request.action = input.action;
	return request;
};
