#!/usr/bin/env bun
/**
 * file-conventions.ts — f00037 S1 (engine).
 *
 * Pure path classifier for the `f00037` file convention. Maps a
 * repo-relative path to one of the 11 documented roles. No I/O. No
 * global state. The companion `file-conventions.script.ts` is the only
 * CLI entrypoint that walks the tree; this module is the engine
 * shared with the lint, the docs generator, and (in S3) the
 * consumer-facing `mcpv conventions` profile.
 *
 * Architecture (SOLID):
 *   - `IRoleRule` — one rule in the chain. Each rule declares a name
 *     and a `match(path)` predicate. (Interface Segregation: only
 *     what is needed.)
 *   - `DEFAULT_TS_RULES` — the default rule list for TypeScript
 *     projects. Re-exported so tests and the consumer profile can
 *     compose or replace it. (Open/Closed: add a new role without
 *     editing the classifier.)
 *   - `classifyPath(path, rules?)` — pure function. Returns the first
 *     rule whose `match(path)` returns true, or `'other'` if none.
 *     (Liskov: every rule is interchangeable in the chain.)
 *   - `Role` — the closed union of all known roles. (Dependency
 *     Inversion: callers depend on the role names, not the rules.)
 *
 * Determinism: rule order matters. Earlier rules win; the table in
 * `docs/FILE-CONVENTIONS.md` is the source of truth for the order.
 * `barrel` wins over `other` but loses to role suffixes because role
 * suffixes are more specific.
 */
import { basename } from 'node:path';

/** The closed set of file roles recognised by `f00037`. */
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
	/** Canonical role name; must be one of the `Role` literals. */
	readonly name: Role;
	/** Pure predicate. Repo-relative POSIX path (`/` separators). */
	readonly match: (relPath: string) => boolean;
}

/** Build a rule in one expression for the default table below. */
const rule = (name: Role, match: (rel: string) => boolean): IRoleRule => ({
	name,
	match,
});

/** True if any segment of the path equals `needle`. */
const hasSegment = (rel: string, needle: string): boolean =>
	rel.split('/').includes(needle);

/** True if `rel` ends with the given basename pattern. */
const endsWithBasename = (rel: string, suffix: string): boolean =>
	basename(rel) === suffix || basename(rel).endsWith(`.${suffix}`);

/**
 * Default rule chain for TypeScript monorepos. Order matters: more
 * specific rules first (`generated`, `barrel`); suffix-based role
 * rules second; everything else falls through to `other` (implicit
 * final rule added by `classifyPath`).
 */
/* ------------------------------------------------------------------ *
 *  Individual rules — each named constant owns one role's classification
 *  concern (SRP). The composer at the bottom is the only place that
 *  orders the chain; new roles are added by appending a new constant
 *  here and a single line to `DEFAULT_TS_RULES` below (Open/Closed).
 * ------------------------------------------------------------------ */

/** 1. Generated outputs always win — they are owned by a generator
 *  and exempted from the suffix rule entirely. */
const GeneratedRule: IRoleRule = rule(
	'generated',
	(rel) =>
		hasSegment(rel, 'generated') ||
		hasSegment(rel, '.astro') ||
		/\.generated\./.test(basename(rel)),
);

/** 2. Configuration files — package-local tool/test/build config. */
const ConfigRule: IRoleRule = rule('config', (rel) =>
	/\.config\.ts$/.test(basename(rel)),
);

/** 3. Tests — test suffix wins over role suffix when both apply. */
const TestRule: IRoleRule = rule('test', (rel) =>
	/(?:\.e2e)?\.spec\.tsx?$/.test(basename(rel)),
);

/** Type companions: feature-private structural helpers. */
const TypeRule: IRoleRule = rule(
	'type',
	(rel) => /\.types\.ts$/.test(basename(rel)) || hasSegment(rel, 'contracts'),
);

/** 4. Script entrypoints and script-local helper modules. */
const ScriptRule: IRoleRule = rule('script', (rel) =>
	hasSegment(rel, 'scripts'),
);

/** 5. Host/CLI commands. */
const CommandRule: IRoleRule = rule('command', (rel) =>
	hasSegment(rel, 'commands'),
);

/** 6. UI/host providers. */
const ProviderRule: IRoleRule = rule('provider', (rel) =>
	hasSegment(rel, 'providers'),
);

/** 7. Render-only views. */
const ViewRule: IRoleRule = rule('view', (rel) => hasSegment(rel, 'views'));

/** 8. UI components and controllers. */
const ComponentRule: IRoleRule = rule('component', (rel) =>
	hasSegment(rel, 'components'),
);

/** 9. Route handlers/pages. */
const PageRule: IRoleRule = rule('page', (rel) => hasSegment(rel, 'pages'));

/** 10. Translation dictionaries and language surfaces. */
const I18nRule: IRoleRule = rule('i18n', (rel) => hasSegment(rel, 'i18n'));

/** 11. Static data modules. */
const DataRule: IRoleRule = rule('data', (rel) => hasSegment(rel, 'data'));

/** 12. Local dev-only entrypoints. */
const DevRule: IRoleRule = rule('dev', (rel) => hasSegment(rel, 'dev'));

/** 13. Host webview modules. */
const WebviewRule: IRoleRule = rule('webview', (rel) =>
	hasSegment(rel, 'webviews'),
);

/** 14. Transport adapters. */
const TransportRule: IRoleRule = rule('transport', (rel) =>
	hasSegment(rel, 'transport'),
);

const folderRule = (name: Role, segment: string): IRoleRule =>
	rule(name, (rel) => hasSegment(rel, segment));

const BootstrapRule = folderRule('bootstrap', 'bootstrap');
const SwarmRule = folderRule('swarm', 'swarm');
const ProposalRule = folderRule('proposal', 'proposals');
const AgentRule = folderRule('agent', 'agents');
const DashboardRule = folderRule('dashboard', 'dashboard');
const FrameworkRule = folderRule('framework', 'frameworks');
const SharedRule = folderRule('shared', 'shared');
const CliRule = folderRule('cli', 'cli');
const HostRule = folderRule('host', 'host');
const ToolbarRule = folderRule('toolbar', 'toolbar');
const CascadeRule = folderRule('cascade', 'cascade');
const InstallRule = folderRule('install', 'install');
const MetricRule = folderRule('metric', 'metrics');
const MigrationRule = folderRule('migration', 'migrations');
const ScaffoldRule = folderRule('scaffold', 'scaffold');
const SetupRule = folderRule('setup', 'setup');
const KnowledgeRule = folderRule('knowledge', 'knowledge');
const LockRule = folderRule('lock', 'locks');
const ProjectRule = folderRule('project', 'project');
const SkillRule = folderRule('skill', 'skills');
const WorkspaceRule = folderRule('workspace', 'workspace');
const SettingRule = folderRule('setting', 'settings');

const EntryRule: IRoleRule = rule('entry', (rel) =>
	/(?:^|\/)(?:cli|extension)\.ts$/.test(rel),
);

const PluginRule: IRoleRule = rule('plugin', (rel) =>
	/\/src\/lib\/plugins\//.test(rel),
);

const AppLibRule: IRoleRule = rule('app-lib', (rel) =>
	/^apps\/web\/src\/lib\//.test(rel),
);

const TestSupportRule: IRoleRule = rule('test-support', (rel) =>
	/\/tests\//.test(rel),
);

const IssueRule: IRoleRule = rule('issue', (rel) =>
	/^plugins\/issues\//.test(rel),
);

const MarkerRule: IRoleRule = rule('marker', (rel) =>
	/^plugins\/status-marker\//.test(rel),
);

const ConventionRule: IRoleRule = rule('convention', (rel) =>
	/^plugins\/test-convention\//.test(rel),
);

/** 15. Public barrels — `src/public/index.ts` and `src/index.ts`.
 *  These re-export the package surface and carry no role suffix. */
const BarrelRule: IRoleRule = rule('barrel', (rel) => {
	const base = basename(rel);
	if (base !== 'index.ts') return false;
	return (
		rel.endsWith('/src/public/index.ts') || /\/src\/index\.ts$/.test(rel)
	);
});

/** 3. Interface contracts — under `contracts/interfaces/` or `.interface.ts`. */
const InterfaceRule: IRoleRule = rule(
	'interface',
	(rel) =>
		hasSegment(rel, 'contracts/interfaces') || /\.interface\.ts$/.test(rel),
);

/** 4. Constant contracts — under `contracts/constants/` or `.constant.ts`. */
const ConstantRule: IRoleRule = rule(
	'constant',
	(rel) =>
		hasSegment(rel, 'contracts/constants') || /\.constant\.ts$/.test(rel),
);

/** 5. Services — under `services/` or `.service.ts`. */
const ServiceRule: IRoleRule = rule(
	'service',
	(rel) => hasSegment(rel, 'services') || endsWithBasename(rel, 'service.ts'),
);

/** 6. MCP tools — under `tools/` or `.tool.ts`. Tools never live at
 *  the package root because the role is project-wide. */
const ToolRule: IRoleRule = rule(
	'tool',
	(rel) => hasSegment(rel, 'tools') || endsWithBasename(rel, 'tool.ts'),
);

/** 7. Registries — `.registry.ts` (and `registry/` or `registries/` folder). */
const RegistryRule: IRoleRule = rule(
	'registry',
	(rel) =>
		hasSegment(rel, 'registry') ||
		hasSegment(rel, 'registries') ||
		endsWithBasename(rel, 'registry.ts'),
);

/** 8. Registration glue — `.register.ts` (and `register/` or `registers/` folder). */
const RegisterRule: IRoleRule = rule(
	'register',
	(rel) =>
		hasSegment(rel, 'register') ||
		hasSegment(rel, 'registers') ||
		endsWithBasename(rel, 'register.ts'),
);

/** 9. Factories — `.factory.ts` or `factories/` folder. */
const FactoryRule: IRoleRule = rule(
	'factory',
	(rel) =>
		hasSegment(rel, 'factories') || endsWithBasename(rel, 'factory.ts'),
);

/** 10. Builders — `.builder.ts` or `builders/` folder. */
const BuilderRule: IRoleRule = rule(
	'builder',
	(rel) => hasSegment(rel, 'builders') || endsWithBasename(rel, 'builder.ts'),
);

/** Default rule chain. Order matters: more specific rules first
 *  (`generated`, `barrel`); suffix-based role rules second; everything
 *  else falls through to `'other'` (implicit final rule added by
 *  `classifyPath`). */
export const DEFAULT_TS_RULES: readonly IRoleRule[] = [
	GeneratedRule,
	TestRule,
	ConfigRule,
	ScriptRule,
	CommandRule,
	ProviderRule,
	ViewRule,
	ComponentRule,
	PageRule,
	I18nRule,
	DataRule,
	DevRule,
	WebviewRule,
	TransportRule,
	BarrelRule,
	InterfaceRule,
	ConstantRule,
	TypeRule,
	ServiceRule,
	ToolRule,
	RegistryRule,
	RegisterRule,
	FactoryRule,
	BuilderRule,
	BootstrapRule,
	SwarmRule,
	AgentRule,
	DashboardRule,
	FrameworkRule,
	SharedRule,
	CliRule,
	HostRule,
	ToolbarRule,
	CascadeRule,
	InstallRule,
	MetricRule,
	MigrationRule,
	ScaffoldRule,
	SetupRule,
	KnowledgeRule,
	LockRule,
	ProjectRule,
	SkillRule,
	WorkspaceRule,
	SettingRule,
	EntryRule,
	PluginRule,
	AppLibRule,
	TestSupportRule,
	IssueRule,
	MarkerRule,
	ConventionRule,
	ProposalRule,
];

/**
 * Classify a repo-relative POSIX path. Falls through to `'other'` when
 * no rule matches. POSIX-only (`/` separators) — callers must convert
 * from the host OS before calling.
 *
 * @param relPath - repo-relative POSIX path, e.g. `packages/core/src/lib/tools/foo.tool.ts`
 * @param rules   - optional override rule chain (defaults to `DEFAULT_TS_RULES`)
 */
export const classifyPath = (
	relPath: string,
	rules: readonly IRoleRule[] = DEFAULT_TS_RULES,
): Role => {
	if (typeof relPath !== 'string' || relPath.length === 0) return 'other';
	// Normalise Windows backslashes defensively (lint scripts may be
	// invoked on Windows even though CI is Linux).
	const rel = relPath.replaceAll('\\', '/');
	for (const r of rules) {
		try {
			if (r.match(rel)) return r.name;
		} catch {}
	}
	return 'other';
};
