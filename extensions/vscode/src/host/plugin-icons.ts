/**
 * plugin-icons.ts — the canonical, single-source mapping of every
 * mcp-vertex plugin to a DISTINCT, semantically representative icon
 * (f00053 S3).
 *
 * Before this module the tool tree gave every plugin the same default
 * tree icon (or none), so a reader could not tell `git` from `memory`
 * at a glance. Here each of the 16 plugins maps to a distinct VS Code
 * codicon id whose glyph represents what the plugin does. The id is a
 * plain string (`vscode.ThemeIcon` ids), so this module stays free of
 * any `vscode` import and is unit-testable in isolation; the host
 * adapter turns the id into a `ThemeIcon` when it renders the tree.
 *
 * Single source of truth: the WEB cards (apps/web `/logos/plugin-<slug>.svg`)
 * and this tree mapping express the SAME per-plugin identity — one
 * concept per plugin. (Physically sharing the list across web +
 * extension is the job of the shared layer in S7; until then the slug
 * set is kept in sync here and asserted complete by the spec.)
 */

/** The 16 plugins shipped under `plugins/`. */
export const PLUGIN_SLUGS: readonly string[] = [
	'audit',
	'conventions',
	'deps',
	'docs',
	'git',
	'issues',
	'logs',
	'memory',
	'notification',
	'proposals',
	'quality',
	'rules',
	'search',
	'status-marker',
	'test-convention',
	'web-fetch',
];

/**
 * slug → codicon id. Each glyph is chosen to represent the plugin's job
 * and is distinct from every other (asserted by the spec).
 */
export const PLUGIN_ICON_BY_SLUG: Readonly<Record<string, string>> = {
	audit: 'checklist', // scored review against a checklist
	conventions: 'symbol-namespace', // naming / structural conventions
	deps: 'package', // dependency packages
	docs: 'book', // documentation
	git: 'git-commit', // git history
	issues: 'issues', // tracked issues
	logs: 'output', // the operational event log
	memory: 'database', // durable stored facts
	notification: 'bell', // status notifications
	proposals: 'git-pull-request', // the proposal/slice workflow
	quality: 'check-all', // quality gates passing
	rules: 'law', // coding rules
	search: 'search', // workspace search
	'status-marker': 'pulse', // per-agent status heartbeat
	'test-convention': 'beaker', // tests
	'web-fetch': 'globe', // remote web content
};

/** Icon for the root server node. */
export const SERVER_ICON_ID = 'server-process';

/**
 * Fallback for any namespace that is not one of the 16 plugins (e.g.
 * the core meta-tools under the `mcp-vertex` namespace). Still a real,
 * non-text icon so the tree never shows a bare label.
 */
export const DEFAULT_PLUGIN_ICON_ID = 'extensions';

/**
 * Resolve a plugin/namespace to its codicon id. Unknown namespaces get
 * a real default icon — never a text fallback.
 */
export const iconIdForPlugin = (plugin: string): string =>
	PLUGIN_ICON_BY_SLUG[plugin] ?? DEFAULT_PLUGIN_ICON_ID;
