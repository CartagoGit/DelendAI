/**
 * f00084 S2 (patch) + f00087 S1 (preview) — canonical default options
 * for every plugin that ships in the mcp-vertex monorepo.
 *
 * The `init` command uses this map to populate `plugins.<id>.options`
 * so the bootstrap never produces an empty `options: {}` block when the
 * underlying plugin has well-known defaults. The map is hardcoded for
 * now; once f00087 S1 lands a dynamic loader, this file becomes the
 * fallback for plugins that do not yet export `defaultOptions`.
 *
 * Each entry is a plain JSON-serialisable object. Plugin-specific
 * defaults are mirrored from the plugin's own `DEFAULT_OPTIONS`
 * constant (search the plugin source for the canonical values).
 */
import type { IInitAnswers } from './init-answers.schema';

export type IPluginDefaults = Readonly<Record<string, Record<string, unknown>>>;

/**
 * Canonical defaults, kept in sync with the plugin sources. If a plugin
 * is not listed here, `init` writes `options: {}` and the plugin's
 * own internal `?? DEFAULT_X` fallbacks kick in at runtime.
 */
export const PLUGIN_DEFAULTS: IPluginDefaults = {
	git: {},
	search: {
		roots: [
			'packages',
			'plugins',
			'extensions',
			'apps',
			'tools',
			'scripts',
		],
		extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md', '.json'],
		ignoreDirs: ['node_modules', '.cache', 'dist', 'build', '.git'],
	},
	memory: {
		bm25K1: 1.5,
		bm25B: 0.75,
		titleWeight: 2,
		maxNotes: 1000,
	},
	docs: {
		roots: ['docs/mcp-vertex', 'README.md'],
		extensions: ['.md', '.mdx'],
		ignoreDirs: ['node_modules', '.cache', 'dist'],
	},
	rules: {},
	quality: {},
	deps: {
		manifest: 'package.json',
		allowNetwork: false,
		allowWrite: false,
	},
	proposals: {
		validationCommand: 'bun run validate',
		namePool: ['falcon', 'owl', 'crow', 'sparrow', 'finch'],
		orchestration: { delegateAfterToolCalls: 3 },
	},
	notification: {
		intervalMs: 2000,
		heartbeatMs: 30_000,
	},
	logs: {
		retentionDays: 30,
	},
	'status-marker': {},
	'test-convention': {},
	conventions: {
		roots: ['packages', 'plugins', 'extensions', 'apps', 'tools'],
	},
	'web-fetch': {
		// Empty by default — fail closed until the user adds a host.
		allowList: [],
	},
	issues: {
		// `repo` is REQUIRED before the plugin registers tools, but
		// we cannot infer the right `owner/name` from a fresh
		// workspace. The user must fill this in by hand.
		scaffoldDir: 'docs/mcp-vertex/proposals/retired/issues',
	},
	audit: {
		auditDir: 'docs/proposals/done/audits',
		topActions: 5,
		layers: [],
	},
};

/**
 * Merge the canonical defaults with the answers the user picked
 * during the interactive flow. Anything the user provides wins; the
 * defaults fill in only what the user did not explicitly choose.
 */
export const resolvePluginOptions = (
	pluginId: string,
	_overrides: Partial<IInitAnswers> = {},
): Record<string, unknown> => {
	const defaults = PLUGIN_DEFAULTS[pluginId];
	return defaults ? { ...defaults } : {};
};
