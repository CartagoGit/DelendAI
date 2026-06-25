/**
 * file-conventions.ts — f00037 S1 (engine) + f00057 S8 (contract migration).
 *
 * The original encoding of the TypeScript file-convention profile lived
 * here AND in `plugins/conventions/src/lib/services/typescript-profile.ts`,
 * drift-prone. f00057 S8 deletes both copies and moves the single source
 * of truth to `@mcp-vertex/core/lib/contracts/file-conventions.contract.ts`.
 *
 * This module is now a 1:1 re-export of the contract so the existing
 * CLI entrypoint (`file-conventions.script.ts`) and the existing spec
 * companion (`file-conventions.script.spec.ts`) keep importing the
 * same surface they imported before.
 *
 * Architecture (SOLID):
 *   - The contract under `@mcp-vertex/core/public` owns the rule data
 *     and the pure classifier. This module just re-exports it.
 *   - The CLI script (`file-conventions.script.ts`) is the only caller
 *     that walks the tree.
 *   - The plugin (`@mcp-vertex/conventions`) re-exports the same
 *     contract via `typescript-profile.service.ts`, so the lint and
 *     the MCP tool classify identically.
 */
export {
	classifyPath,
	DEFAULT_TS_RULES,
	endsWithBasename,
	hasSegment,
	type IRoleRule,
	type Role,
} from '../../../packages/core/src/lib/contracts/file-conventions.contract';
