/**
 * typescript-profile.ts — the consumer-facing TypeScript file-convention
 * profile (f00037 S3).
 *
 * This is the plugin's OWN, self-contained encoding of the canonical
 * role rules documented in `docs/FILE-CONVENTIONS.md`. It mirrors the
 * lint-side engine (`tools/scripts/lint/file-conventions.ts`) but stays
 * within the plugin's package boundary so the plugin depends on nothing
 * outside `@mcp-vertex/core` (a plugin must not import from `tools/`).
 * The rule set intentionally mirrors the repo-native folders recognised
 * by the lint-side engine; `typescript-profile.parity.spec.ts` is the
 * drift guard that keeps the two encodings in lock-step.
 *
 * Architecture (SOLID):
 *   - `IRoleRule` — one rule: a `name` + a pure `match(path)` predicate
 *     (Interface Segregation).
 *   - `TYPESCRIPT_RULES` — the default ordered chain; appending a role
 *     never edits `classifyPath` (Open/Closed).
 *   - `classifyPath(path, rules?)` — pure; first matching rule wins,
 *     else `'other'` (Liskov: rules are interchangeable; Dependency
 *     Inversion: callers depend on `Role`, not on the rule internals).
 */
import { basename } from 'node:path';

/** The closed set of file roles recognised by the f00037 convention. */
export type Role =
	| 'interface'
	| 'constant'
	| 'service'
	| 'tool'
	| 'registry'
	| 'register'
	| 'factory'
	| 'builder'
	| 'generated'
	| 'test'
	| 'config'
	| 'script'
	| 'command'
	| 'provider'
	| 'view'
	| 'component'
	| 'page'
	| 'i18n'
	| 'data'
	| 'dev'
	| 'webview'
	| 'transport'
	| 'bootstrap'
	| 'swarm'
	| 'proposal'
	| 'agent'
	| 'dashboard'
	| 'framework'
	| 'shared'
	| 'cli'
	| 'host'
	| 'toolbar'
	| 'cascade'
	| 'install'
	| 'metric'
	| 'migration'
	| 'scaffold'
	| 'setup'
	| 'knowledge'
	| 'lock'
	| 'project'
	| 'skill'
	| 'workspace'
	| 'entry'
	| 'plugin'
	| 'app-lib'
	| 'setting'
	| 'test-support'
	| 'issue'
	| 'marker'
	| 'convention'
	| 'type'
	| 'barrel'
	| 'other';

/** A single rule in the classification chain. */
export interface IRoleRule {
	/** Canonical role name; one of the `Role` literals (except `'other'`). */
	readonly name: Exclude<Role, 'other'>;
	/** Pure predicate over a repo-relative POSIX path (`/` separators). */
	readonly match: (relPath: string) => boolean;
}

const rule = (
	name: IRoleRule['name'],
	match: (rel: string) => boolean,
): IRoleRule => ({ name, match });

/** True if any `/`-segment of the path equals `needle`. */
const hasSegment = (rel: string, needle: string): boolean =>
	rel.split('/').includes(needle);

/** True if `rel`'s basename is exactly `suffix` or ends with `.${suffix}`. */
const endsWithBasename = (rel: string, suffix: string): boolean =>
	basename(rel) === suffix || basename(rel).endsWith(`.${suffix}`);

/**
 * Default rule chain for TypeScript monorepos. Order matters: more
 * specific rules (`generated`, `barrel`) first, suffix/folder role rules
 * second; anything unmatched falls through to `'other'`.
 */
export const TYPESCRIPT_RULES: readonly IRoleRule[] = [
	rule(
		'generated',
		(rel) =>
			hasSegment(rel, 'generated') ||
			hasSegment(rel, '.astro') ||
			/\.generated\./.test(basename(rel)),
	),
	rule('test', (rel) => /(?:\.e2e)?\.spec\.tsx?$/.test(basename(rel))),
	rule('config', (rel) => /\.config\.ts$/.test(basename(rel))),
	rule('script', (rel) => hasSegment(rel, 'scripts')),
	rule('command', (rel) => hasSegment(rel, 'commands')),
	rule('provider', (rel) => hasSegment(rel, 'providers')),
	rule('view', (rel) => hasSegment(rel, 'views')),
	rule('component', (rel) => hasSegment(rel, 'components')),
	rule('page', (rel) => hasSegment(rel, 'pages')),
	rule('i18n', (rel) => hasSegment(rel, 'i18n')),
	rule('data', (rel) => hasSegment(rel, 'data')),
	rule('dev', (rel) => hasSegment(rel, 'dev')),
	rule('webview', (rel) => hasSegment(rel, 'webviews')),
	rule('transport', (rel) => hasSegment(rel, 'transport')),
	rule('barrel', (rel) => {
		if (basename(rel) !== 'index.ts') return false;
		return (
			rel.endsWith('/src/public/index.ts') ||
			/\/src\/index\.ts$/.test(rel)
		);
	}),
	rule(
		'interface',
		(rel) =>
			hasSegment(rel, 'contracts/interfaces') ||
			/\.interface\.ts$/.test(rel),
	),
	rule(
		'constant',
		(rel) =>
			hasSegment(rel, 'contracts/constants') ||
			/\.constant\.ts$/.test(rel),
	),
	rule(
		'type',
		(rel) =>
			/\.types\.ts$/.test(basename(rel)) || hasSegment(rel, 'contracts'),
	),
	rule(
		'service',
		(rel) =>
			hasSegment(rel, 'services') || endsWithBasename(rel, 'service.ts'),
	),
	rule(
		'tool',
		(rel) => hasSegment(rel, 'tools') || endsWithBasename(rel, 'tool.ts'),
	),
	rule(
		'registry',
		(rel) =>
			hasSegment(rel, 'registry') ||
			hasSegment(rel, 'registries') ||
			endsWithBasename(rel, 'registry.ts'),
	),
	rule(
		'register',
		(rel) =>
			hasSegment(rel, 'register') ||
			hasSegment(rel, 'registers') ||
			endsWithBasename(rel, 'register.ts'),
	),
	rule(
		'factory',
		(rel) =>
			hasSegment(rel, 'factories') || endsWithBasename(rel, 'factory.ts'),
	),
	rule(
		'builder',
		(rel) =>
			hasSegment(rel, 'builders') || endsWithBasename(rel, 'builder.ts'),
	),
	rule('bootstrap', (rel) => hasSegment(rel, 'bootstrap')),
	rule('swarm', (rel) => hasSegment(rel, 'swarm')),
	rule('agent', (rel) => hasSegment(rel, 'agents')),
	rule('dashboard', (rel) => hasSegment(rel, 'dashboard')),
	rule('framework', (rel) => hasSegment(rel, 'frameworks')),
	rule('shared', (rel) => hasSegment(rel, 'shared')),
	rule('cli', (rel) => hasSegment(rel, 'cli')),
	rule('host', (rel) => hasSegment(rel, 'host')),
	rule('toolbar', (rel) => hasSegment(rel, 'toolbar')),
	rule('cascade', (rel) => hasSegment(rel, 'cascade')),
	rule('install', (rel) => hasSegment(rel, 'install')),
	rule('metric', (rel) => hasSegment(rel, 'metrics')),
	rule('migration', (rel) => hasSegment(rel, 'migrations')),
	rule('scaffold', (rel) => hasSegment(rel, 'scaffold')),
	rule('setup', (rel) => hasSegment(rel, 'setup')),
	rule('knowledge', (rel) => hasSegment(rel, 'knowledge')),
	rule('lock', (rel) => hasSegment(rel, 'locks')),
	rule('project', (rel) => hasSegment(rel, 'project')),
	rule('skill', (rel) => hasSegment(rel, 'skills')),
	rule('workspace', (rel) => hasSegment(rel, 'workspace')),
	rule('setting', (rel) => hasSegment(rel, 'settings')),
	rule('entry', (rel) => /(?:^|\/)(?:cli|extension)\.ts$/.test(rel)),
	rule('plugin', (rel) => /\/src\/lib\/plugins\//.test(rel)),
	rule('app-lib', (rel) => /^apps\/web\/src\/lib\//.test(rel)),
	rule('test-support', (rel) => /\/tests\//.test(rel)),
	rule('issue', (rel) => /^plugins\/issues\//.test(rel)),
	rule('marker', (rel) => /^plugins\/status-marker\//.test(rel)),
	rule('convention', (rel) => /^plugins\/test-convention\//.test(rel)),
	rule('proposal', (rel) => hasSegment(rel, 'proposals')),
];

/**
 * Classify a repo-relative POSIX path into its `Role`. Falls through to
 * `'other'` when no rule matches. POSIX-only; Windows backslashes are
 * normalised defensively. A buggy rule never poisons the chain.
 */
export const classifyPath = (
	relPath: string,
	rules: readonly IRoleRule[] = TYPESCRIPT_RULES,
): Role => {
	if (typeof relPath !== 'string' || relPath.length === 0) return 'other';
	const rel = relPath.replaceAll('\\', '/');
	for (const r of rules) {
		try {
			if (r.match(rel)) return r.name;
		} catch {}
	}
	return 'other';
};
