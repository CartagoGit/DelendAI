/**
 * capabilities/inject.ts — f00188 (Track F / security).
 *
 * The runtime half of the capability pipeline:
 *
 *   1. `parseDeclaredCapabilities(manifest)` — read the
 *      `capabilities` field off a manifest and validate it against
 *      the typed `Capability` union.
 *   2. `resolveCapabilityAccess(declared, requested)` — pure
 *      gate: returns `null` when granted, an `ICapabilityRefusal`
 *      when denied. The router and the lint consume this directly.
 *   3. `createCapabilityContext(declared, impl, onRefuse?)` —
 *      runtime Proxy that returns a refusal when a plugin tries to
 *      use a capability it did not declare. Plugins that compile
 *      against the typed shape never hit this branch; plugins that
 *      bypass the type system (e.g. via an untyped escape hatch) do,
 *      and the refusal surfaces as a typed envelope.
 *   4. `summariseLegacyShimWarning(declared, pluginName)` —
 *      produces the warning string emitted at boot when a plugin
 *      ships without an explicit `capabilities` array.
 *
 * Design notes (DIP + ISP):
 *   - The pure gate is the heart of the contract — it has zero
 *     dependency on the Proxy, the router or the manifest loader.
 *   - The Proxy is a thin adapter over the gate; swapping the
 *     adapter (e.g. for a logger-backed variant in tests) is a
 *     factory argument, not a code change.
 *   - The shim helper is a string-only helper so it can be unit
 *     tested without any I/O.
 */

import {
	CAPABILITIES,
	type CapabilitiesToCtx,
	type Capability,
	type CapabilityMethod,
	type ICapabilityRefusal,
	isCapability,
	parseCapabilityList,
} from './schema';

/**
 * Read the `capabilities` field of an arbitrary manifest-shaped
 * object. Pure. Returns `[]` for manifests that omit the field,
 * which is the legacy shim signal. Accepts `unknown` because the
 * manifest arrives untyped at the plugin boundary.
 */
export const parseDeclaredCapabilities = (
	manifest: unknown,
): readonly Capability[] => {
	const raw =
		typeof manifest === 'object' && manifest !== null
			? (manifest as { readonly capabilities?: unknown }).capabilities
			: undefined;
	if (!Array.isArray(raw)) return [];
	return parseCapabilityList(raw);
};

/**
 * Pure gate: is `requested` covered by `declared`? Returns `null`
 * when granted, a typed refusal envelope otherwise. The refusal
 * carries the original `requested` token so a caller can match it
 * against a `ctx.capabilities.*` chain without losing the path.
 */
export const resolveCapabilityAccess = (
	declared: readonly Capability[],
	requested: string,
): ICapabilityRefusal | null => {
	if (!isCapability(requested)) {
		return {
			kind: 'capability-denied',
			capability: requested,
			declared,
		};
	}
	if ((declared as readonly string[]).includes(requested)) return null;
	return {
		kind: 'capability-denied',
		capability: requested,
		declared,
	};
};

/**
 * Build a callable capability context keyed by `<group>.<action>`.
 * The returned function returns `null` when the requested
 * capability is declared, or a typed `ICapabilityRefusal` envelope
 * otherwise. Pure: no Proxy, no globals — easy to unit-test.
 *
 * Usage:
 *
 *   const gate = createCapabilityGate(parseDeclaredCapabilities(m));
 *   gate('git:write');   // → null (declared)
 *   gate('network:fetch'); // → { kind: 'capability-denied', ... }
 */
export const createCapabilityGate = (declared: readonly Capability[]) => {
	const declaredSet = new Set<string>(declared);
	return (requested: string): ICapabilityRefusal | null => {
		if (declaredSet.has(requested) && isCapability(requested)) return null;
		return {
			kind: 'capability-denied',
			capability: requested,
			declared,
		};
	};
};

export interface ILegacyShimWarning {
	readonly pluginName: string;
	readonly granted: readonly Capability[];
	readonly message: string;
}

/**
 * Format the warning emitted at boot when a plugin ships without
 * an explicit `capabilities` declaration. The shim grants the full
 * set so legacy plugins keep working; the lint (`c00137`) escalates
 * this to an error once the migration window closes.
 */
export const summariseLegacyShimWarning = (
	pluginName: string,
): ILegacyShimWarning => ({
	pluginName,
	granted: CAPABILITIES,
	message: `plugin "${pluginName}" did not declare capabilities; granting all (${CAPABILITIES.length}) under the legacy shim. The lint:capabilities check will reject this on the next migration window — add an explicit capabilities array to the manifest.`,
});

/**
 * The implementation surface the runtime can actually perform,
 * keyed by `<group>.<action>`. Every entry is optional: a host that
 * has not wired a concrete runner for a capability simply omits it,
 * and an invoked granted-but-unwired capability throws a loud wiring
 * error (a host bug, not a plugin bug).
 */
export interface ICapabilityImplementationMap {
	readonly [group: string]:
		| Readonly<Record<string, CapabilityMethod>>
		| undefined;
}

/**
 * f00188 — runtime enforcement Proxy. Builds the `ctx.capabilities`
 * object that only exposes the DECLARED subset as callable methods:
 *
 *   - granted → the matching implementation from `impl` is returned;
 *   - denied  → a stub that calls `onRefuse` and returns the typed
 *               `ICapabilityRefusal` envelope is returned.
 *
 * Plugins that compile against `CapabilitiesToCtx<C>` never hit the
 * denied branch — TypeScript blocks the access. Plugins that bypass
 * the type system with an unsafe cast, duck typing, or another untyped escape hatch
 * DO hit it and receive the refusal instead of a generic error.
 *
 * A capability that is granted but has no registered implementation
 * throws a loud wiring error when invoked, so a misconfigured host
 * cannot silently swallow a granted capability.
 */
export const createCapabilityContext = <C extends Capability>(
	declared: readonly C[],
	impl: ICapabilityImplementationMap,
	onRefuse?: (refusal: ICapabilityRefusal) => void,
): CapabilitiesToCtx<C> => {
	const gate = createCapabilityGate(declared);
	const groupProxies = new Map<string, Record<string, CapabilityMethod>>();

	const buildGroup = (group: string): Record<string, CapabilityMethod> => {
		const cached = groupProxies.get(group);
		if (cached !== undefined) return cached;
		const proxy = new Proxy({} as Record<string, CapabilityMethod>, {
			get(_target, actionRaw) {
				const action = String(actionRaw);
				if (action === 'then') return undefined;
				const refusal = gate(`${group}:${action}`);
				if (refusal !== null) {
					return (..._args: readonly unknown[]) => {
						onRefuse?.(refusal);
						return refusal;
					};
				}
				const granted = impl[group]?.[action];
				if (typeof granted === 'function') return granted;
				return (..._args: readonly unknown[]) => {
					throw new Error(
						`capability "${group}:${action}" is granted but no implementation is registered`,
					);
				};
			},
			has(_target, actionRaw) {
				return gate(`${group}:${String(actionRaw)}`) === null;
			},
		});
		groupProxies.set(group, proxy);
		return proxy;
	};

	return new Proxy({} as CapabilitiesToCtx<C>, {
		get(_target, groupRaw) {
			const group = String(groupRaw);
			// Guard: a Proxy that answers `get('then')` with a function
			// would be treated as a thenable by `await`/Promise chains.
			if (group === 'then') return undefined;
			return buildGroup(group);
		},
		has(_target, groupRaw) {
			const group = String(groupRaw);
			return declared.some((capability) =>
				capability.startsWith(`${group}:`),
			);
		},
	});
};
