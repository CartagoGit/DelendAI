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

export interface INormalizedResolveCapabilityIdentityInput {
	readonly qualifiedName?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
}

/**
 * Identity of a resolved capability. The `access` field is the
 * effective runtime state at the moment of resolution — `'visible'`
 * for tools the catalog currently advertises, `'hidden'` for tools
 * behind a lazy or progressive-disclosure tier, `'deactivated'` for
 * tools an operator explicitly disabled.
 */
export interface IResolvedIdentity {
	readonly toolName: string;
	readonly qualifiedName: string;
	readonly pluginId?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
	readonly access: 'visible' | 'hidden' | 'deactivated';
}

export type TResolveIdentityResult =
	| { readonly kind: 'resolved'; readonly identity: IResolvedIdentity }
	| {
			readonly kind: 'ambiguous';
			readonly requestedName: string;
			readonly candidates: readonly string[];
	  };

const normalizeInput = (value: string | undefined): string | undefined => {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const normalizeResolveIdentityInput = (input: {
	readonly qualifiedName?: string | undefined;
	readonly domain?: string | undefined;
	readonly action?: string | undefined;
}): INormalizedResolveCapabilityIdentityInput => {
	const qualifiedName = normalizeInput(input.qualifiedName);
	const domain = normalizeInput(input.domain);
	const action = normalizeInput(input.action);
	return {
		...(qualifiedName !== undefined ? { qualifiedName } : {}),
		...(domain !== undefined ? { domain } : {}),
		...(action !== undefined ? { action } : {}),
	};
};

const canonicalCandidates = (
	entries: readonly {
		readonly name: string;
		readonly toolId: string;
		readonly pluginId?: string | undefined;
	}[]
): readonly string[] =>
	[...new Set(entries.map((entry) => entry.name))].sort((left, right) =>
		left.localeCompare(right)
	);

/**
 * Find the catalog entry that owns `qualifiedName`, if any. Uses the
 * runtime's `searchTools` so it works against the public catalog
 * surface (no special access to internals). The match is exact on the
 * qualified name AND on the bare `toolId`, since the LLM may have
 * supplied either form.
 */
const findByQualifiedName = (
	runtime: IToolSurfaceRuntime,
	qualifiedName: string
	): TResolveIdentityResult | undefined => {
	const matches = runtime.searchTools({ query: qualifiedName });
	const exactNameMatch = matches.find((entry) => entry.name === qualifiedName);
	const exactToolIdMatches = matches.filter(
		(entry) => entry.toolId === qualifiedName
	);
	const found = exactNameMatch ?? exactToolIdMatches[0];
	if (exactNameMatch === undefined && exactToolIdMatches.length > 1) {
		return {
			kind: 'ambiguous',
			requestedName: qualifiedName,
			candidates: canonicalCandidates(exactToolIdMatches),
		};
	}
	if (found === undefined) return undefined;
	const exposure = runtime.getToolExposure(found.name);
	if (exposure === 'unknown') return undefined;
	return {
		kind: 'resolved',
		identity: {
			toolName: found.toolId,
			qualifiedName: found.name,
			...(found.pluginId !== undefined ? { pluginId: found.pluginId } : {}),
			access: exposure,
		},
	};
};

/**
 * Resolve the capability identity. Tries `qualifiedName` first, then
 * `domain + action`. Returns `undefined` when neither lookup succeeds
 * (a recoverable miss — the caller distinguishes `catalog_missing`).
 */
export const resolveIdentity = (
	runtime: IToolSurfaceRuntime,
	input: INormalizedResolveCapabilityIdentityInput
	): TResolveIdentityResult | undefined => {
	const { qualifiedName, domain, action } = input;

	if (qualifiedName !== undefined) {
		const found = findByQualifiedName(runtime, qualifiedName);
		if (found !== undefined) {
			return found.kind === 'resolved'
				? {
					kind: 'resolved',
					identity: {
						...found.identity,
						...(domain !== undefined ? { domain } : {}),
						...(action !== undefined ? { action } : {}),
					},
				}
				: found;
		}
		// Continue to the fallback. `qualifiedName` not in catalog is
		// NOT a hard error yet — the LLM might have given a router
		// qualifier (e.g. `proposals.create_proposal`) that the
		// domain/action lookup can still honour.
	}

	if (domain !== undefined && action !== undefined) {
		const route = runtime.resolveRoute(domain, action);
		if (route !== undefined) {
			const exposure = runtime.getToolExposure(route.name);
			if (exposure !== 'unknown') {
				return {
					kind: 'resolved',
					identity: {
						toolName: route.toolId,
						qualifiedName: route.name,
						pluginId: route.pluginId,
						domain,
						action,
						access: exposure,
					},
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
	const { qualifiedName, domain, action } = normalizeResolveIdentityInput(input);
	if (qualifiedName !== undefined) request.qualifiedName = qualifiedName;
	if (domain !== undefined) request.domain = domain;
	if (action !== undefined) request.action = action;
	return request;
};
