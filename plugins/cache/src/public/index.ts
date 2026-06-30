/**
 * Public re-exports for `@mcp-vertex/cache`.
 *
 * Downstream tooling can build the static rule set or wire `cache_gc`
 * without going through the plugin registry.
 */
export {
	buildStaticRules,
	CACHE_OWNER,
} from '../lib/static-rules';
export type { IStaticRuleOptions } from '../lib/static-rules';
export { registerStaticRules } from '../lib/registry';
export { buildGcRegistration } from '../lib/tools/gc-tool';
export type { IGcToolOptions } from '../lib/tools/gc-tool';

// --- generated tool-output types (see `bun run types:generate`) ------------
export type * from '../generated/tool-outputs';
