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
 *   3. `createCapabilityContext(declared, onRefuse)` — runtime
 *      Proxy that returns a refusal when a plugin tries to use a
 *      capability it did not declare. Plugins that compile against
 *      the typed shape never hit this branch; plugins that bypass
 *      the type system (e.g. via an untyped escape hatch) do, and the refusal
 *      surfaces as a typed envelope.
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
	type Capability,
	type ICapabilityRefusal,
	isCapability,
	parseCapabilityList,
} from './schema';

/**
 * Read the `capabilities` field of an arbitrary manifest-shaped
 * object. Pure. Returns `[]` for manifests that omit the field,
 * which is the legacy shim signal.
 */
export const parseDeclaredCapabilities = (
	manifest: { readonly capabilities?: readonly unknown[] } | null | undefined,
): readonly Capability[] => {
	const raw = manifest?.capabilities;
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
