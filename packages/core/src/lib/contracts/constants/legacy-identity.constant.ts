/**
 * legacy-identity.constant.ts — b00239 S2/S8.
 *
 * The one place that knows what the old identity looked like.
 *
 * Every migrator, the residual scanner and the detection probe need the
 * same answer to "what counts as the previous name?", and they need it to
 * be the SAME answer. A rename where the migrator and the scanner disagree
 * is a rename that reports itself complete while leaving live references
 * behind — the exact shape of bug this repository spent 2026-09-04 fixing
 * in four separate gates.
 */

/** Every spelling of the previous identity that appears in a workspace. */
export const LEGACY_IDENTITY_SPELLINGS = [
	'mcp-vertex',
	'mcp_vertex',
	'mcpvertex',
	'MCP Vertex',
	'MCP-VERTEX',
	'@mcp-vertex',
	'mcpv',
] as const;

/**
 * Path segments whose contents are history by definition: a record of what
 * happened, not an instruction to follow.
 *
 * Generic on purpose. An earlier version listed this repository's own
 * `/proposals/done/`, which put the name of a plugin's domain inside core
 * — the exact coupling r00043 exists to remove, and `core-proposals-boundary`
 * caught it. It was also simply wrong: where a project keeps its history is
 * that project's decision, not the runtime's. Callers pass their own
 * segments through `extraHistoricalSegments`.
 */
export const HISTORICAL_PATH_SEGMENTS = [
	'/audits/',
	'/CHANGELOG',
	'/wiki/',
] as const;

export const VENDORED_PATH_SEGMENTS = [
	'/node_modules/',
	'/vendor/',
	'/third-party/',
] as const;

export const GENERATED_PATH_MARKERS = [
	'.generated.',
	'/generated/',
	'.d.ts',
] as const;
