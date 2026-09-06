/**
 * identity-renames.ts — b00239 S4.
 *
 * The single source of truth for "old identity spelling → new identity
 * spelling", shared by every format-specific migrator.
 *
 * ## Why this lives here, not next to LEGACY_IDENTITY_SPELLINGS
 *
 * The migrators need ordered pairs ("rewrite THIS into THAT"). The
 * residual scanner (S8) needs the set of LEGACY strings to classify
 * "live" hits. Those are two different shapes — the migrator side is
 * a rename plan, the scanner side is a hit classification — and
 * folding them into one constant forces one consumer to carry the
 * other's data. Two constants, one purpose each, no coupling.
 *
 * ## What the pairs look like
 *
 * Each entry replaces the legacy product identity (the old public
 * name) with the new one (the current product identity). The list is
 * ordered MOST-SPECIFIC first so `@mcp-vertex/core` is rewritten as a
 * whole before any substring match on `mcp-vertex` could mangle it.
 * Migrators iterate top-to-bottom and stop at the first hit per
 * string.
 */

/** One legacy-identity token and its replacement. */
export interface IIdentityRename {
	readonly from: string;
	readonly to: string;
}

/**
 * The canonical legacy → new renames for the product identity.
 *
 * Order matters: `@mcp-vertex` is checked before `mcp-vertex` so an
 * npm scope is rewritten atomically. The PascalCase and UPPERCASE
 * variants come before their lowercase cousins so a tokenised rewrite
 * never half-converts "MCP Vertex" into "DELENDAI Vertex".
 */
export const IDENTITY_RENAMES: readonly IIdentityRename[] = [
	{ from: '@mcp-vertex', to: '@delendai' },
	{ from: 'MCP-VERTEX', to: 'DELENDAI' },
	{ from: 'MCP_VERTEX', to: 'DELENDAI' },
	{ from: 'MCP Vertex', to: 'DelendAI' },
	{ from: 'mcp_vertex', to: 'delendai' },
	{ from: 'mcpvertex', to: 'delendai' },
	{ from: 'mcp-vertex', to: 'delendai' },
	{ from: 'mcpv', to: 'delendai' },
] as const;

/**
 * Apply the renames to one string. Returns the input unchanged when
 * no legacy token appears. Pure: a function, no shared state, no I/O.
 *
 * Iteration is by ordered pair (NOT by regex alternation) so the
 * longest match wins and `@mcp-vertex/core` survives intact.
 */
export const rewriteIdentityInString = (input: string): string => {
	let output = input;
	for (const { from, to } of IDENTITY_RENAMES) {
		if (output.includes(from)) output = output.split(from).join(to);
	}
	return output;
};

/**
 * Did the string change under the rewrite?
 *
 * Migrators use this to decide whether a file is worth writing back:
 * the cheap walk says "yes/no" and the expensive write only happens
 * on yes.
 */
export const stringHasLegacyIdentity = (input: string): boolean => {
	for (const { from } of IDENTITY_RENAMES)
		if (input.includes(from)) return true;
	return false;
};
