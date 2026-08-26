/**
 * capabilities/schema.ts — f00188 (Track F / security).
 *
 * The typed union of capabilities a plugin can declare and ask for at
 * runtime. Each capability is a `<group>:<action>` literal that maps
 * 1:1 to a method on `ctx.capabilities.<group>.<action>(...)`.
 *
 * Design notes (SRP + OCP):
 *   - The literal list is the canonical source — adding a new
 *     capability means appending a literal both here and (optionally)
 *     to the `CAPABILITIES` runtime array; nothing else in core has
 *     to change to extend the union.
 *   - `parseCapability` is the pure validator; the rest of the
 *     capability pipeline (injection, lint, matrix generator) all
 *     consume it.
 *   - The refusal shape mirrors the existing `toolError` envelopes
 *     used by the runtime so plugin authors can `throw` or `return`
 *     the same shape.
 *
 * Privacy: this file declares capability *names* only — no tool
 * names, no plugin-specific vocabulary. Per R1.1 the contract stays
 * host-agnostic.
 */

export type TCapabilityGroup = 'git' | 'fs' | 'network' | 'process' | 'memory';

/**
 * The full set of capabilities the core recognises. Adding a new
 * capability requires:
 *   1. append the literal to the union below,
 *   2. append the same literal to `CAPABILITIES` (alphabetical),
 *   3. (optional) teach the lint/matrix in `tools/scripts/...` about
 *      the new group so the docs surface stays in sync.
 */
export type Capability =
	| 'git:read'
	| 'git:write'
	| 'git:push'
	| 'fs:read'
	| 'fs:write'
	| 'network:fetch'
	| 'process:spawn'
	| 'memory:read'
	| 'memory:write';

/**
 * Runtime list of every capability. Kept alphabetical so two PRs
 * that each add a new capability do not collide on insertion order.
 */
export const CAPABILITIES: readonly Capability[] = Object.freeze([
	'fs:read',
	'fs:write',
	'git:push',
	'git:read',
	'git:write',
	'memory:read',
	'memory:write',
	'network:fetch',
	'process:spawn',
]);

export interface ICapabilityRefusal {
	readonly kind: 'capability-denied';
	readonly capability: Capability | string;
	readonly declared: readonly Capability[];
}

/**
 * Validate a single capability token. Returns the typed literal when
 * the input is a known capability, `null` otherwise. Pure.
 */
export const isCapability = (input: unknown): input is Capability =>
	typeof input === 'string' &&
	(CAPABILITIES as readonly string[]).includes(input);

/**
 * Validate and normalise a capability token. Throws on unknown
 * inputs (use `isCapability` when you want a soft check). Pure.
 */
export const parseCapability = (input: unknown): Capability => {
	if (isCapability(input)) return input;
	throw new Error(
		`unknown capability: ${JSON.stringify(input)} (known: ${CAPABILITIES.join(', ')})`,
	);
};

/**
 * Parse a list of capabilities. Each entry MUST be a known
 * capability — duplicate entries are tolerated because manifests
 * may declare the same capability twice through different sources
 * (e.g. the per-tool map + the global array). Pure.
 */
export const parseCapabilityList = (
	input: readonly unknown[],
): readonly Capability[] => {
	const out: Capability[] = [];
	for (const value of input) {
		out.push(parseCapability(value));
	}
	return out;
};

/**
 * Group → action map. Used by the injection layer to build a typed
 * `ctx.capabilities.<group>.<action>` shape and by the lint to map a
 * detected usage back to a capability token.
 */
export interface ICapabilityParts {
	readonly group: TCapabilityGroup;
	readonly action: string;
}

/**
 * Split a `group:action` literal into its two halves. Pure.
 * Returns `null` when the input does not contain a `:` — the
 * caller decides how to react (the lint reports a malformed usage
 * line; the injection layer throws).
 */
export const splitCapability = (input: string): ICapabilityParts | null => {
	const colon = input.indexOf(':');
	if (colon <= 0 || colon === input.length - 1) return null;
	return {
		group: input.slice(0, colon) as TCapabilityGroup,
		action: input.slice(colon + 1),
	};
};
