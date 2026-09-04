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
 * Paths whose contents are history by definition: a record of what
 * happened, not an instruction to follow.
 *
 * A list rather than a pattern, because "is this file history?" is a
 * judgement about intent that a regex can only approximate — and the
 * approximation should be visible and arguable, not buried.
 */
export const HISTORICAL_PATH_SEGMENTS = [
	'/proposals/done/',
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
