/**
 * Canonical default options for the plugins that ship with the monorepo.
 * Consumers can use this map to materialise explicit `plugins.<id>.options`
 * blocks without depending on plugin-internal fallback logic.
 */

export const PLUGIN_DEFAULTS: Readonly<
	Record<string, Readonly<Record<string, unknown>>>
> = {
	git: {},
	// a00063: search ships NO materialised defaults. The old block
	// stamped mcp-vertex's own monorepo roots (packages/plugins/...)
	// and a NARROWER extension list than the engine's built-ins into
	// every adopter's config — an Angular app got roots that don't
	// exist and lost html/scss, so every search scanned 0 files. The
	// engine's own defaults (walk `.`, rich extension list, gitignore
	// + ignoreDirs aware) are correct for any project shape; `init`
	// derives real roots per-workspace via `deriveSourceRoots`.
	search: {},
	memory: {
		bm25K1: 1.5,
		bm25B: 0.75,
		titleWeight: 2,
		maxNotes: 1000,
	},
	docs: {
		roots: ['docs/mcp-vertex', 'README.md'],
		extensions: ['md', 'mdx'],
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
	// a00063: same as search — no stamped monorepo roots; `init`
	// derives the real ones per-workspace.
	conventions: {},
	'web-fetch': {
		allowList: [],
	},
	'auto-agent-selector': {},
	security: {},
	diagram: {},
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
