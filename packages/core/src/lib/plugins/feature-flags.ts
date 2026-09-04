/**
 * feature-flags.ts — f00152 S5 (L3 — feature flags).
 *
 * Feature flags give `@delendai/core` and its plugins a way to opt
 * into risky or unfinished behavior without breaking the canonical
 * path. Every flag is **default-off**: legacy behavior is the
 * stable contract, opt-in is the only path to the new path.
 *
 * Lifecycle:
 *   1. A flag ships in `featureFlags: { name: true|false }` (default false).
 *   2. One release later, the flag is `@deprecated` in
 *      `docs/mcp-vertex/api/feature-flags.md` with a `removalVersion`.
 *   3. On the release matching `removalVersion`, the flag is deleted
 *      and the new behavior becomes canonical.
 *
 * SOLID notes:
 *   - **SRP**: this file owns the runtime + the catalog shape. The
 *     catalog reader (markdown parser) lives in
 *     `tools/scripts/lint/feature-flags.script.ts`.
 *   - **DIP**: consumers receive an `IFeatureFlagSource` (a small
 *     interface) instead of the full `IMcpPluginContext`. Tests can
 *     pass a stub.
 */
import type { IMcpPluginContext } from './plugin-contract';

/**
 * Single source of truth for a flag's metadata. Surfaced by the
 * catalog and the lint so the runtime and the docs never drift.
 */
export interface IFeatureFlagEntry {
	readonly name: string;
	readonly sinceVersion: string;
	readonly defaultValue: boolean;
	readonly removalVersion: string;
	readonly description: string;
}

/**
 * The minimal contract a feature-flag source must satisfy. The full
 * `IMcpPluginContext` implements it via `options.featureFlags`, but
 * tests can pass a record literal without rebuilding the whole ctx.
 */
export interface IFeatureFlagSource {
	readonly options: Readonly<Record<string, unknown>>;
}

/**
 * Pure reader — given a source, return the flag value or the
 * strict default-off. Never throws; never coerces `undefined` to
 * `true`.
 */
export const readFeatureFlag = (
	source: IFeatureFlagSource,
	key: string,
): boolean => {
	const flags = source.options.featureFlags;
	if (flags === null || typeof flags !== 'object') return false;
	const value = (flags as Record<string, unknown>)[key];
	if (typeof value === 'boolean') return value;
	return false;
};

/**
 * Plugin-context reader. Convenience for plugin authors — they pass
 * `ctx` and the key, and get the flag value back.
 */
export const coreFeatureFlag = (
	ctx: Pick<IMcpPluginContext, 'options'>,
	key: string,
): boolean => readFeatureFlag({ options: ctx.options }, key);
