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
	// stamped delendai's own monorepo roots (packages/plugins/...)
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
		// a00063: same as `search`. These are OUR layout; an adopter's
		// docs live wherever their docsDir says, and the engine's own
		// defaults cover any project shape.
	},
	rules: {},
	quality: {},
	refactor: {},
	browser: {},
	'prompt-eval': {},
	observability: {},
	'context-for-change': {},
	'impact-analysis': {},
	'adaptive-optimizer': {
		maxBytes: 2000,
	},
	'project-health': {
		maxBytes: 2000,
	},
	'quality-policy': {
		maxBytes: 2000,
	},
	forge: {},
	'remote-provider-core': {},
	github: {},
	gitlab: {},
	// Every first-party plugin needs an entry here even when it takes no
	// options: `PLUGIN_DEFAULTS` is what tells the host the plugin is
	// configurable at all. A missing entry leaves it wired but
	// unconfigurable, which is the confusing half-state
	// `verify:plugin-wiring` exists to catch.
	'agent-orchestrator': {},
	'audit-orchestrator': {},
	cache: {},
	'commit-policy': {},
	'external-mcps': {},
	'project-kpis': {},
	deps: {
		manifest: 'package.json',
		allowNetwork: false,
		allowWrite: false,
	},
	proposals: {
		// a00063 again, and the biggest instance of it: `namePool` was 68
		// names copied out of the proposals plugin's own
		// DEFAULT_AGENT_NAME_POOL and stamped into every adopter's config
		// by `init`. A default that is written out stops being a default —
		// it becomes the adopter's frozen declaration, so a name added to
		// the pool never reaches them. The plugin owns it and falls back to
		// it whenever the option is absent.
		orchestration: { delegateAfterToolCalls: 3 },
	},
	notification: {
		intervalMs: 2000,
		heartbeatMs: 30_000,
	},
	logs: {
		retentionCount: 10,
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
	'auto-plugin-selector': {},
	security: {},
	'skills-pack': {},
	'prompts-pack': {},
	'test-policy': {},
	'usage-tracking': {},
	'orchestrator-runner': {},
	diagram: {},
	env: {},
	i18n: {},
	container: {},
	perf: {},
	'tech-debt': {},
	'link-check': {},
	issues: {
		// The issues plugin owns DEFAULT_SCAFFOLD_DIR.
	},
	audit: {
		// Derived, not literal: the audit plugin's own schema documents
		// this as `<docsDir>/proposals/done/audits`, computed from the
		// host's resolved docsDir. A literal freezes a path computed for
		// nobody.
		topActions: 5,
		layers: [],
	},
	database: {},
	api: {},
	changelog: {},
	completion: {},
	'error-reporting': {
		enabled: true,
	},
};

export const resolvePluginOptions = (
	pluginId: string,
): Record<string, unknown> => {
	const defaults = PLUGIN_DEFAULTS[pluginId];
	return defaults ? { ...defaults } : {};
};
