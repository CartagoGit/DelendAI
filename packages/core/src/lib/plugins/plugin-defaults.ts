/**
 * Canonical default options for the plugins that ship with the monorepo.
 * Consumers can use this map to materialise explicit `plugins.<id>.options`
 * blocks without depending on plugin-internal fallback logic.
 */

export const PLUGIN_DEFAULTS: Readonly<
	Record<string, Readonly<Record<string, unknown>>>
> = {
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
		allowList: [],
	},
	issues: {
		scaffoldDir: 'docs/mcp-vertex/proposals/retired/issues',
	},
	audit: {
		auditDir: 'docs/proposals/done/audits',
		topActions: 5,
		layers: [],
	},
};

export const resolvePluginOptions = (
	pluginId: string,
): Record<string, unknown> => {
	const defaults = PLUGIN_DEFAULTS[pluginId];
	return defaults ? { ...defaults } : {};
};