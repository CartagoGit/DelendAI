/**
 * file-conventions.contract.ts — f00037 / f00057 S8.
 *
 * The canonical TypeScript file-convention profile that classifies a
 * repo-relative path into one of the 53 documented roles (see
 * `docs/FILE-CONVENTIONS.md`). This contract is the SINGLE source of
 * truth; both consumers import from here:
 *
 *   - `tools/scripts/lint/file-conventions.ts` — the lint engine
 *     (CLI entrypoint `file-conventions.script.ts` walks the tree and
 *     uses `classifyPath`).
 *   - `plugins/conventions/src/lib/services/typescript-profile.service.ts`
 *     — the consumer-facing MCP plugin (`conventions_classify` /
 *     `conventions_check`).
 *
 * Before f00057 S8, each consumer re-encoded the rule table locally.
 * The lint and the plugin each owned a `Role` union, an `IRoleRule`
 * interface, and ~50 individual `IRoleRule` constants. A parity spec
 * (`tests/src/lib/contracts/file-conventions.contract.spec.ts`)
 * compares the two import sites and proves the data is byte-identical.
 *
 * Architecture (SOLID):
 *   - `Role` — closed union of every role name; the source of truth
 *     that both consumers narrow against.
 *   - `IRoleRule` — one rule: a `name` + a pure `match(path)` predicate.
 *     Interface Segregation: callers depend on this shape, not on the
 *     helper constructors.
 *   - `DEFAULT_TS_RULES` — ordered chain. Order matters: more specific
 *     rules first (`generated`, `barrel`), then folder-based, then
 *     suffix-based, then everything else falls through to `'other'`
 *     (added implicitly by `classifyPath`).
 *   - `classifyPath(path, rules?)` — pure, first-match-wins, returns
 *     `'other'` as the implicit final rule.
 *
 * Open/Closed: a new role means appending a constant here AND a single
 * line to `DEFAULT_TS_RULES`. Neither consumer's classifier needs to
 * change; both re-import from this contract.
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
	/** Canonical role name; must be one of the `Role` literals. */
	readonly name: Role;
	/** Pure predicate. Repo-relative POSIX path (`/` separators). */
	readonly match: (relPath: string) => boolean;
}

/** True if any segment of the path equals `needle`. */
export const hasSegment = (rel: string, needle: string): boolean =>
	rel.split('/').includes(needle);

/** True if `rel` ends with the given basename pattern. */
export const endsWithBasename = (rel: string, suffix: string): boolean =>
	basename(rel) === suffix || basename(rel).endsWith(`.${suffix}`);

/** Build a rule in one expression. Local helper, not exported. */
const rule = (name: Role, match: (rel: string) => boolean): IRoleRule => ({
	name,
	match,
});

/** Build a folder-segment rule. Local helper, not exported. */
const folderRule = (name: Role, segment: string): IRoleRule =>
	rule(name, (rel) => hasSegment(rel, segment));

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

/** 2. Tests — test suffix wins over role suffix when both apply. */
const TestRule: IRoleRule = rule('test', (rel) =>
	/(?:\.e2e)?\.spec\.tsx?$/.test(basename(rel)),
);

/** 3. Configuration files — package-local tool/test/build config. */
const ConfigRule: IRoleRule = rule('config', (rel) =>
	/\.config\.ts$/.test(basename(rel)),
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

/** 16. Interface contracts — under `contracts/interfaces/` or `.interface.ts`. */
const InterfaceRule: IRoleRule = rule(
	'interface',
	(rel) =>
		hasSegment(rel, 'contracts/interfaces') || /\.interface\.ts$/.test(rel),
);

/** 17. Constant contracts — under `contracts/constants/` or `.constant.ts`. */
const ConstantRule: IRoleRule = rule(
	'constant',
	(rel) =>
		hasSegment(rel, 'contracts/constants') || /\.constant\.ts$/.test(rel),
);

/** 18. Services — under `services/` or `.service.ts`. */
const ServiceRule: IRoleRule = rule(
	'service',
	(rel) => hasSegment(rel, 'services') || endsWithBasename(rel, 'service.ts'),
);

/** 19. Type companions: feature-private structural helpers.
 *  MUST come after InterfaceRule + ConstantRule (which are more specific
 *  sub-paths of `contracts/`) so the generic `contracts` segment match
 *  does not steal them. */
const TypeRule: IRoleRule = rule(
	'type',
	(rel) => /\.types\.ts$/.test(basename(rel)) || hasSegment(rel, 'contracts'),
);

/** 20. MCP tools — under `tools/` or `.tool.ts`. */
const ToolRule: IRoleRule = rule(
	'tool',
	(rel) => hasSegment(rel, 'tools') || endsWithBasename(rel, 'tool.ts'),
);

/** 21. Registry tables — under `registry/`/`registries/` or `.registry.ts`. */
const RegistryRule: IRoleRule = rule(
	'registry',
	(rel) =>
		hasSegment(rel, 'registry') ||
		hasSegment(rel, 'registries') ||
		endsWithBasename(rel, 'registry.ts'),
);

/** 22. Tool registration modules. */
const RegisterRule: IRoleRule = rule(
	'register',
	(rel) =>
		hasSegment(rel, 'register') ||
		endsWithBasename(rel, 'register.ts') ||
		endsWithBasename(rel, 'tools.ts'),
);

/** 23. Factory functions. */
const FactoryRule: IRoleRule = rule(
	'factory',
	(rel) =>
		hasSegment(rel, 'factory') ||
		hasSegment(rel, 'factories') ||
		endsWithBasename(rel, 'factory.ts'),
);

/** 24. Builder aggregates. */
const BuilderRule: IRoleRule = rule(
	'builder',
	(rel) =>
		hasSegment(rel, 'builder') ||
		hasSegment(rel, 'builders') ||
		endsWithBasename(rel, 'builder.ts'),
);

/**
 * Default rule chain for TypeScript monorepos. Order matters: more
 * specific rules first (`generated`, `barrel`); suffix-based role
 * rules second; everything else falls through to `'other'` (implicit
 * final rule added by `classifyPath`).
 */
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
	ProposalRule,
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
];

/**
 * Classify a repo-relative POSIX path against an ordered rule chain.
 * First matching rule wins; if no rule matches, `'other'` is returned
 * as the implicit final rule (Liskov: every rule is interchangeable).
 *
 * Pure over its inputs. No I/O. No global state.
 *
 * Accepts `undefined`/`null`/non-string defensively: returns `'other'`.
 * This is intentional belt-and-suspenders for runtime guards in
 * downstream consumers (the lint and the MCP plugin both call this
 * from places where an upstream helper might pass an unset value).
 */
export const classifyPath = (
	relPath: string | undefined | null,
	rules: readonly IRoleRule[] = DEFAULT_TS_RULES,
): Role => {
	if (typeof relPath !== 'string' || relPath === '') return 'other';
	for (const rule of rules) {
		try {
			if (rule.match(relPath)) return rule.name;
		} catch {}
	}
	return 'other';
};
