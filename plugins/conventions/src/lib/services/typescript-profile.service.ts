/**
 * typescript-profile.ts — thin re-export wrapper (f00057 S8).
 *
 * The plugin's own copy of the TypeScript file-convention profile was
 * deleted; the canonical encoding now lives in
 * `@mcp-vertex/core/lib/contracts/file-conventions.contract.ts`
 * (re-exported through `@mcp-vertex/core/public`). This module is a
 * 1:1 re-export so existing consumers of
 * `@mcp-vertex/conventions/services/typescript-profile` keep working
 * without import-path changes.
 *
 * The CLI lint engine (`tools/scripts/lint/file-conventions.ts`) also
 * re-exports from the same contract, so the plugin and the lint share
 * ONE rule table. A parity spec at
 * `packages/core/tests/src/lib/contracts/file-conventions.contract.spec.ts`
 * proves they classify a fixture workspace identically.
 */
export {
	classifyPath,
	DEFAULT_TS_RULES,
	endsWithBasename,
	hasSegment,
	type IRoleRule,
	type Role,
} from '@mcp-vertex/core/public';

// Back-compat alias: the plugin used to export `TYPESCRIPT_RULES`
// instead of `DEFAULT_TS_RULES`. Keep the old name alive for any
// downstream consumer that imported it directly.
export { DEFAULT_TS_RULES as TYPESCRIPT_RULES } from '@mcp-vertex/core/public';
