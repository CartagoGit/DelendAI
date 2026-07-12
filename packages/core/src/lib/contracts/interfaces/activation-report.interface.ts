/**
 * activation-report.interface.ts — f00107 S2.
 *
 * The introspection surface for "which plugins/tools are active, from which
 * origin, and why." An agent can read this off `<prefix>_overview` to reason
 * about its own tool surface (and trim it — fewer active tools = a smaller
 * prompt = fewer tokens per call); a host renders it as the plugin
 * switchboard. Pure data: the report is built from the already-assembled
 * load result + the config, never from I/O.
 */
import type { PluginOrigin } from './plugin-origin.interface';

/** Which mechanism turned a plugin on. Precedence when several apply: flag > config > preset. */
export type ActivationSource = 'preset' | 'config' | 'flag';

/** One active plugin's activation facts. */
export interface IActivationEntry {
	/** The plugin id (`IMcpPlugin.name`). */
	readonly id: string;
	/** Ours / the user's own / an external server (see {@link PluginOrigin}). */
	readonly origin: PluginOrigin;
	/** Current activation state; inactive config overrides remain visible for re-enabling. */
	readonly active: boolean;
	/** Why it is on. */
	readonly source: ActivationSource;
	/** How many tools this plugin contributes to the surface. */
	readonly toolCount: number;
}

/** The whole activation report, sorted by origin then id for a stable render. */
export interface IActivationReport {
	readonly entries: readonly IActivationEntry[];
	/** Per-origin tallies so a header can read "9 ours · 1 yours · 2 external" without re-counting. */
	readonly counts: Readonly<Record<PluginOrigin, number>>;
	/** Total tools across all active plugins — the size of the prompt-facing surface. */
	readonly totalTools: number;
}

/**
 * A nested activation surface contributed by a plugin. This keeps core
 * agnostic of plugin-specific option schemas: a composition plugin can
 * describe its configured children without core learning their vocabulary.
 */
export interface IActivationContribution {
	readonly id: string;
	readonly origin: PluginOrigin;
	readonly source: ActivationSource;
	readonly active?: boolean;
	/** Direct tools added to the host surface (zero for proxy-only children). */
	readonly toolCount: number;
}

/** One loaded plugin, reduced to exactly what {@link IActivationReport} needs. */
export interface ILoadedPluginFacts {
	readonly name: string;
	/** The module specifier that actually resolved (drives the origin). */
	readonly resolvedSpecifier: string;
	/** The config entry declared an explicit `path` (f00087) → user-local. */
	readonly hasExplicitPath: boolean;
	/** An external-mcps composed server (`ext.*`) rather than a native plugin. */
	readonly isExternalServer: boolean;
	/** Tools this plugin contributes to the prompt-facing surface. */
	readonly toolCount: number;
}

/**
 * The name-sets each activation mechanism contributed. A plugin can appear
 * in more than one; the report attributes it to the highest-precedence
 * source (flag > config > preset) so "why is it on" has one answer.
 */
export interface IActivationSources {
	readonly fromFlag: ReadonlySet<string>;
	readonly fromConfig: ReadonlySet<string>;
	readonly fromPreset: ReadonlySet<string>;
}
