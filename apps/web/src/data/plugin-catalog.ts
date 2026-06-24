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

/**
 * The 16 plugins shipped under `plugins/`. DATA only — adding a plugin
 * is a new entry here (Open/Closed: no consumer needs to change).
 */
export const PLUGIN_CATALOG: Readonly<Record<string, IPluginCatalogEntry>> = {
	audit: {
		slug: 'audit',
		displayName: 'Audit',
		purpose:
			'Runs exhaustive, scored repository audits per scope (architecture, plugins, apps) and consolidates the findings into an actionable brief.',
		category: 'quality',
	},
	conventions: {
		slug: 'conventions',
		displayName: 'Conventions',
		purpose:
			'Detects and enforces the project’s file/folder naming and structural conventions so the codebase stays consistent as it grows.',
		category: 'quality',
	},
	deps: {
		slug: 'deps',
		displayName: 'Dependencies',
		purpose:
			'Inspects dependency health across package managers — listing, checking and polyglot reporting of outdated or risky dependencies.',
		category: 'integration',
	},
	docs: {
		slug: 'docs',
		displayName: 'Docs',
		purpose:
			'Lists, reads and searches the project’s own documentation so agents ground their answers in the repo’s docs instead of guessing.',
		category: 'knowledge',
	},
	git: {
		slug: 'git',
		displayName: 'Git',
		purpose:
			'Read-only git intelligence — status, diff, blame, log, show and worktree — so agents inspect history without ever mutating the repo.',
		category: 'code-intelligence',
	},
	issues: {
		slug: 'issues',
		displayName: 'Issues',
		purpose:
			'Ingests, analyzes and resolves GitHub issues, turning tracked work into actionable context. Depends on the proposals plugin.',
		category: 'integration',
	},
	logs: {
		slug: 'logs',
		displayName: 'Logs',
		purpose:
			'Queries, tails, correlates and redacts the operational event log so agents can debug runtime behaviour safely.',
		category: 'observability',
	},
	memory: {
		slug: 'memory',
		displayName: 'Memory',
		purpose:
			'Durable, portable agent memory — save, recall, list, export and import facts that survive across sessions.',
		category: 'knowledge',
	},
	notification: {
		slug: 'notification',
		displayName: 'Notification',
		purpose:
			'Coordinates agents with status notifications and lock-await primitives for safe multi-agent handoffs.',
		category: 'workflow',
	},
	proposals: {
		slug: 'proposals',
		displayName: 'Proposals',
		purpose:
			'The multi-agent workflow engine — proposals, slices, locks, a task queue and worktree coordination that drive the swarm.',
		category: 'workflow',
	},
	quality: {
		slug: 'quality',
		displayName: 'Quality',
		purpose:
			'Runs the project’s quality gates (lint, typecheck, test, build) per scope and reports pass/fail back to the agent.',
		category: 'quality',
	},
	rules: {
		slug: 'rules',
		displayName: 'Rules',
		purpose:
			'Project-agnostic, language-aware coding rules — detects each area’s stack and emits the right lint/format/typecheck commands and idioms.',
		category: 'quality',
	},
	search: {
		slug: 'search',
		displayName: 'Search',
		purpose:
			'Fast workspace code and text search so agents locate symbols and files without shelling out.',
		category: 'code-intelligence',
	},
	'status-marker': {
		slug: 'status-marker',
		displayName: 'Status Marker',
		purpose:
			'Tracks and validates per-agent status markers (ping/close) that back the multi-agent status table.',
		category: 'workflow',
	},
	'test-convention': {
		slug: 'test-convention',
		displayName: 'Test Convention',
		purpose:
			'Knows the project’s test conventions and runners — suggests spec paths and scans for convention drift.',
		category: 'quality',
	},
	'web-fetch': {
		slug: 'web-fetch',
		displayName: 'Web Fetch',
		purpose:
			'Fetches remote web content for agents that need external context, behind a host-controlled allowlist.',
		category: 'integration',
	},
};

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
