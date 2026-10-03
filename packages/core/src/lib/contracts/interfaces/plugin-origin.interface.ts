/**
 * plugin-origin.interface.ts — f00107 S1.
 *
 * The origin taxonomy for a loaded plugin: is it (a) **bundled** by us
 * (a first-party `@delendai/*` plugin that ships with the library),
 * (b) **user-local** (the consumer's own plugin — a `path` entry or a
 * third-party package they added), or (c) **external** (a third-party
 * MCP server composed through the external-mcps plugin, `ext.<server>.*`)?
 *
 * Why this lives in the core (not a plugin): the origin is surfaced to
 * agents via the activation report on `<prefix>_overview` and to hosts
 * via the plugin switchboard, so it is a public vocabulary other surfaces
 * depend on — the same reason the provider contract lives here (f00067 S1).
 *
 * The classification is by SPECIFIER SCOPE, not by a hardcoded name list:
 * a first-party plugin is exactly one whose resolved module specifier is
 * `@delendai/*` (the maintainer's npm scope, the same convention
 * `resolvePluginSpecifier` already applies). This cannot drift as plugins
 * are added or removed — there is no list to maintain — which is why it is
 * preferred over enumerating the shipped set.
 */

/** Where a loaded plugin (or composed server) came from. */
export type PluginOrigin = 'bundled' | 'user-local' | 'external';

/**
 * The minimal, pure input the origin classifier needs. No I/O: the caller
 * (the loader / activation report) already knows the resolved specifier
 * and whether the config entry declared an explicit `path`.
 */
export interface IPluginOriginInput {
	/** The plugin's config key / bare name, e.g. `proposals`. */
	readonly name: string;
	/**
	 * The module specifier the loader actually resolved this plugin from,
	 * e.g. `@delendai/proposals` (bundled), `mcp-acme` / `acme` (a
	 * third-party package), or `/abs/path/plugin.js` (a local module).
	 */
	readonly resolvedSpecifier: string;
	/**
	 * True when the config entry declared an explicit `path` (f00087) — the
	 * user pointed at their own module, so it is user-local regardless of
	 * how the specifier reads. Takes precedence over scope.
	 */
	readonly hasExplicitPath?: boolean;
	/**
	 * True when this entry represents a third-party MCP server composed via
	 * external-mcps (`ext.<server>.*`), not a natively-loaded plugin.
	 */
	readonly isExternalServer?: boolean;
}
