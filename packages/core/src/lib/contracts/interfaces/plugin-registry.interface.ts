/**
 * plugin-registry.interface.ts — f00141 S1: plugin registry DTOs.
 *
 * The registry is **plain data** that the resolver reads; no I/O, no
 * network, no host config. A first-party index lives next to the
 * resolver (see `first-party-index.ts`); community sources can opt
 * in by passing their own `IPluginRegistrySource[]` to the resolver.
 */

import type { PermissionCategory } from './permission.interface';
import type { IPluginToolPermissions } from './plugin-tool-permissions.interface';

export type PluginRegistryOrigin = 'first-party' | 'community';

/** Tags surfaced for filtering. Mirrors the keywords already in each plugin's package.json. */
export interface IPluginRegistryEntry {
	/** Stable kebab-case id (matches `plugins.<id>` in delendai.config.json). */
	readonly id: string;
	/** npm package name (e.g. `@delendai/audit`). */
	readonly package: string;
	/** Short summary (one line). Sourced from each plugin's `description` field. */
	readonly summary: string;
	/** Filter tags (e.g. `security`, `perf`, `observability`). */
	readonly tags: readonly string[];
	/** First-party = bundled in this monorepo; community = opt-in third-party. */
	readonly origin: PluginRegistryOrigin;
	/** Declared permission categories for this plugin's tool surface. */
	readonly permissions?: readonly PermissionCategory[] | undefined;
	/** Optional default preset id where this plugin lives. */
	readonly defaultPreset?:
		| 'minimal'
		| 'lean'
		| 'standard'
		| 'swarm'
		| 'full'
		| 'vertex';
	/**
	 * f00179 S2/S3 — measured `staticBytes` for this plugin when its
	 * manifest uses the new `IPluginTokenBudget` shape. Falls back to
	 * the legacy `warning` ceiling when only the legacy shape is
	 * present. `undefined` when the manifest declares no usable
	 * number (defensive: surfaces "we don't know" instead of 0).
	 */
	readonly tokenBudgetBytes?: number | undefined;
	/**
	 * f00180 S3 — per-tool permission map for the plugin's tool
	 * surface. When present, the auto-plugin-selector scorer
	 * consults this map (keyed by tool id) for per-tool risk instead
	 * of the global `permissions` array. `undefined` when the
	 * manifest only declares the legacy global set.
	 */
	readonly toolPermissions?: IPluginToolPermissions | undefined;
	/** Whether managed/lazy must activate this plugin at boot when configured. */
	readonly startupActivation?: boolean | undefined;
	/** Machine-readable sample config derived from the plugin contract. */
	readonly example?: Readonly<Record<string, unknown>> | undefined;
}

/** A registry source — a list of entries plus its origin label. */
export interface IPluginRegistrySource {
	readonly origin: PluginRegistryOrigin;
	readonly entries: readonly IPluginRegistryEntry[];
}

/** Durable config block for extra plugin-registry sources. */
export interface IPluginRegistryConfig {
	/** Local, committed community sources merged with the bundled first-party index. */
	readonly communitySources?: readonly IPluginRegistrySource[];
}

/** Resolver input. */
export interface IResolvePluginsOptions {
	/** All sources (first-party + community). Defaults to the bundled index only. */
	readonly sources?: readonly IPluginRegistrySource[];
	/** Tag filter (AND; entry must carry every requested tag). */
	readonly tags?: readonly string[];
	/** Free-text search across `id`, `package`, and `summary` (case-insensitive). */
	readonly query?: string;
	/** Origin filter. Default: include both. */
	readonly origin?: PluginRegistryOrigin;
	/** Hard cap on result count (default 50, max 200). */
	readonly limit?: number;
}

/** Resolver output. */
export interface IResolvePluginsResult {
	readonly entries: readonly IPluginRegistryEntry[];
	readonly total: number;
	readonly truncated: boolean;
}
