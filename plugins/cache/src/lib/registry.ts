/**
 * registry.ts — wires the cache plugin's static rules into the shared
 * core eviction registry handed in via `ctx.cacheEvictionRegistry`.
 *
 * The registry instance itself lives in `@mcp-vertex/core`
 * (`createCacheEvictionRegistry`); a plugin never owns its own
 * scheduler — it only CONTRIBUTES rules. This module is the thin
 * adapter that registers this plugin's built-in static rules and hands
 * the registry back so the `cache_gc` tool can run it.
 *
 * Idempotent: `register` is last-writer-wins by rule id, so calling it
 * twice (e.g. a host that reloads the plugin) leaves exactly one copy
 * of each rule.
 */
import type { ICacheEvictionRegistry } from '@mcp-vertex/core/public';

import { buildStaticRules, type IStaticRuleOptions } from './static-rules';

/**
 * Register every built-in static rule against `registry`. Returns the
 * registered rule ids (handy for the knowledge entry / tests).
 */
export const registerStaticRules = (
	registry: ICacheEvictionRegistry,
	options: IStaticRuleOptions = {},
): readonly string[] => {
	const rules = buildStaticRules(options);
	for (const rule of rules) registry.register(rule);
	return rules.map((rule) => rule.id);
};
