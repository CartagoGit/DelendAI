/**
 * plugin-catalog.ts — the CANONICAL, host-agnostic source of truth for
 * what every mcp-vertex plugin is and does (f00053 S1).
 *
 * Before this module, a plugin's human-facing "what it does" copy was
 * resolved ad-hoc in `PluginsSection.astro` with a scattered fallback
 * chain: i18n `plugin.<slug>` → first-tool description → the generic
 * `Plugin: <slug>`. That meant the same description could differ between
 * the cards, the detail page and the extension, and a new plugin showed
 * a useless `Plugin: <slug>` until someone added an i18n key.
 *
 * This module makes the catalog the single source of truth:
 *   - `PLUGIN_CATALOG` is DATA only — one entry per plugin, with a
 *     plugin-specific `purpose`, a `category` and a `displayName`.
 *   - `capabilityCountFor` derives the contributed-tool count from the
 *     generated `capabilities.json` (the same manifest the rest of the
 *     site reads), so counts never drift from the real surface.
 *   - `resolvePluginPurpose` documents the ONE resolution order every
 *     consumer (web cards, detail page, the extension) must use.
 *
 * Host-agnostic: this module hardcodes no mcp-vertex-only runtime
 * assumption. A third-party host that ships its own plugins can build
 * the same shape from its own `capabilities.json` + its own catalog.
 */
import capabilities from '#MANIFESTS/capabilities.json';
import { SERVER_NAME } from '#DATA/install';
import { GENERATED_WEB_PLUGIN_CATALOG } from '#DATA/plugins/catalog.generated';

/** The category buckets used to group plugins in the UI. */
export type PluginCategory =
	| 'workflow'
	| 'quality'
	| 'code-intelligence'
	| 'knowledge'
	| 'observability'
	| 'integration';

export interface IPluginCatalogEntry {
	/** Package short-name / route slug (e.g. `proposals`). */
	readonly slug: string;
	/** Human display name for headings. */
	readonly displayName: string;
	/** Canonical 1–2 sentence "what this plugin does", agent- and human-facing. */
	readonly purpose: string;
	/** UI grouping bucket. */
	readonly category: PluginCategory;
}

export const PLUGIN_CATALOG: Readonly<Record<string, IPluginCatalogEntry>> =
	Object.fromEntries(
		GENERATED_WEB_PLUGIN_CATALOG.map((entry) => [
			entry.slug,
			{
				slug: entry.slug,
				displayName: entry.displayName,
				purpose: entry.purpose,
				category: entry.category as PluginCategory,
			},
		]),
	);

/** Every plugin slug shipped under `plugins/`, in catalog order. */
export const PLUGIN_SLUGS: readonly string[] = Object.keys(PLUGIN_CATALOG);

/**
 * Map a package short-name to its tool namespace. The core's tools are
 * namespaced under the server name (`mcp-vertex`), not `core`.
 */
const namespaceFor = (slug: string): string =>
	slug === 'core' ? SERVER_NAME : slug;

interface ICapabilityTool {
	readonly name: string;
	readonly namespace: string;
	readonly description?: string;
}

const TOOLS = capabilities.tools as readonly ICapabilityTool[];

/**
 * Number of tools the plugin contributes in the current capabilities
 * snapshot. Derived from the generated manifest so it never drifts from
 * the real tool surface. A plugin that is not in the active preset
 * (and therefore contributes no tools to this snapshot) returns 0.
 */
export const capabilityCountFor = (slug: string): number =>
	TOOLS.filter((tool) => tool.namespace === namespaceFor(slug)).length;

/** The tools a plugin contributes, with their one-line descriptions. */
export const capabilityToolsFor = (
	slug: string,
): readonly ICapabilityTool[] => {
	const ns = namespaceFor(slug);
	return TOOLS.filter((tool) => tool.namespace === ns);
};

/**
 * Resolve the human-facing purpose for a plugin. THE one resolution
 * order, documented here so no consumer reinvents it:
 *
 *   1. the canonical catalog `purpose` (the single source of truth);
 *   2. a localized i18n override (only fills a gap if a slug ever lacks
 *      a canonical entry);
 *   3. the plugin's first contributed tool description;
 *   4. a generic, last-resort `Plugin: <slug>.` string.
 *
 * Because every shipped plugin has a canonical entry, (1) wins in
 * practice — which is the point: the scattered fallbacks are gone.
 */
export const resolvePluginPurpose = (
	slug: string,
	opts: { i18nOverride?: string; firstToolDescription?: string } = {},
): string => {
	const canonical = PLUGIN_CATALOG[slug]?.purpose;
	if (canonical) return canonical;
	if (opts.i18nOverride && opts.i18nOverride.length > 0)
		return opts.i18nOverride;
	if (opts.firstToolDescription && opts.firstToolDescription.length > 0)
		return opts.firstToolDescription;
	return `Plugin: ${slug}.`;
};
