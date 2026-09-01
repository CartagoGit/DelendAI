import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import {
	coerceSurfaceMode,
	type IMcpToolSurfaceMode,
} from '../contracts/interfaces/surface-mode.interface';
import {
	PRESET_CATALOG,
	resolvePresetMembers,
	type IPresetKind,
} from './preset-catalog';
import { resolve as resolvePath } from 'node:path';

/**
 * Parsed mcp-vertex CLI invocation. Pure data so the loader and tests
 * never touch `process.argv` directly.
 */
export interface IMcpVertexCliArgs {
	/** Effective plugin specifiers after merging preset + flag and exclusions. */
	readonly plugins: readonly string[];
	/** Preset members that remain active after `--exclude-plugins`. */
	readonly presetPlugins: readonly string[];
	/** Explicit `--plugins` entries that remain active after exclusions. */
	readonly flagPlugins: readonly string[];
	/** Plugins to subtract from the resolved set (`--exclude-plugins=a,b`). */
	readonly excludePlugins: readonly string[];
	/** Scratch/state root (`--cacheDir`). */
	readonly cacheDir: string;
	/** Human-edited docs root (`--docsDir`). */
	readonly docsDir: string;
	/** Absolute workspace root (`--workspace`, default cwd). */
	readonly workspace: string;
	/** Tool-surface strategy (`--surface=managed|native|adaptive|compact`). */
	readonly surfaceMode: IMcpToolSurfaceMode;
	/** Optional operator-only startup report level override. */
	readonly startupReportLevel?: string | undefined;
	/** Server name advertised over MCP (`--name`). */
	readonly serverName: string;
	/** Server version (`--serverVersion`). */
	readonly serverVersion: string;
	/** Core tool namespace (`--prefix`), optional. */
	readonly namespacePrefix?: string | undefined;
	/** Path to the config file (`--config`), optional (autodetected otherwise). */
	readonly configPath?: string | undefined;
	/**
	 * On first start, analyze the project and prepare a project-specific
	 * MCP server blueprint. `--mcp-project-create=false` disables it.
	 */
	readonly mcpProjectCreate: boolean;
	/** Include tests in the blueprint. `--mcp-project-tests=false` to omit. */
	readonly mcpProjectTests: boolean;
	/**
	 * Host-scoped gate for `agent_worktree` (`--agent-worktree[=true|false]`).
	 * `undefined` when the flag is absent, so a downstream resolver can fall
	 * back to the file config and finally the `false` default. A bare
	 * `--agent-worktree` resolves to `true`; an unrecognised value
	 * (`--agent-worktree=maybe`) throws a parse error.
	 */
	readonly agentWorktree?: boolean | undefined;
	/**
	 * f00154 S4 — auto-load the `logs` plugin when this flag is on
	 * and the explicit `--plugins` list does not include it. Lets a
	 * host guarantee "every tool call lands in the redacted JSONL
	 * streams" without enumerating the `logs` plugin on every
	 * command line. `--strict-logs[=true|false]` follows the same
	 * tri-state shape as `--agent-worktree`.
	 */
	readonly strictLogs?: boolean | undefined;
	/** Any other `--key=value` flags, forwarded to plugins via ctx.args. */
	readonly extra: Readonly<Record<string, string>>;
	/** The raw tokenized flags, so callers can detect what was explicit. */
	readonly tokens: Readonly<Record<string, string>>;
}

export const DEFAULT_CLI_ARGS = {
	cacheDir: DEFAULT_CORE_PATHS.cacheDir,
	docsDir: DEFAULT_CORE_PATHS.docsDir,
	serverName: 'mcp-vertex',
	serverVersion: '0.1.0',
} as const;

const KNOWN_KEYS = new Set([
	'plugins',
	'preset',
	'exclude-plugins',
	'excludePlugins',
	'cacheDir',
	'docsDir',
	'workspace',
	'surface',
	'startup-report',
	'name',
	'serverVersion',
	'prefix',
	'config',
	'check',
	'doctor',
	'verbose',
	'mcp-project-create',
	'mcp-project-tests',
	'agent-worktree',
	'strict-logs',
]);

/**
 * Resolve a tri-state boolean CLI flag. `undefined` token ⇒ `undefined`
 * (caller decides the default). A bare flag tokenizes to `'true'`.
 * Recognised truthy/falsey strings map cleanly; anything else throws a
 * clear parse error instead of silently collapsing to `false`.
 */
const parseTriStateFlag = (
	flag: string,
	value: string | undefined,
): boolean | undefined => {
	if (value === undefined) return undefined;
	if (value === 'true' || value === '1' || value === 'yes') return true;
	if (value === 'false' || value === '0' || value === 'no') return false;
	throw new Error(
		`Invalid value for ${flag}: "${value}". Use ${flag}=true or ${flag}=false.`,
	);
};

// Curated plugin presets (additive). `--preset=standard` saves typing the
// full `--plugins` list; it merges with any explicit `--plugins`.
//
// The canonical membership lives in `./preset-catalog.ts`. This map is a
// thin projection consumed by the legacy `PLUGIN_PRESETS` export and by
// `resolvePreset` — both kept stable so existing callers and tests don't
// break. The web page (`apps/web/src/pages/presets.astro`) and any new
// consumer MUST read `PRESET_CATALOG` directly.
export const PLUGIN_PRESETS: Readonly<Record<string, readonly string[]>> =
	Object.freeze(
		Object.fromEntries(
			PRESET_CATALOG.map((def) => [
				def.id,
				resolvePresetMembers(def.id as IPresetKind),
			]),
		),
	) as Readonly<Record<string, readonly string[]>>;

/** Plugins for a preset name, or `[]` when the name is unknown. */
export const resolvePreset = (name: string | undefined): readonly string[] =>
	resolvePresetMembers(name);

/** Whether the caller explicitly selected the plugin surface. */
export const hasExplicitPluginSurfaceSelection = (
	args: Pick<IMcpVertexCliArgs, 'tokens'>,
): boolean =>
	args.tokens.preset !== undefined || args.tokens.plugins !== undefined;

const isFalse = (value: string | undefined): boolean =>
	value === 'false' || value === '0' || value === 'no';

/** Tokenize `--key=value`, `--key value` and `--flag` into a map. */
const tokenize = (argv: readonly string[]): Record<string, string> => {
	const out: Record<string, string> = {};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined || !token.startsWith('--')) continue;
		const body = token.slice(2);
		const eq = body.indexOf('=');
		if (eq >= 0) {
			out[body.slice(0, eq)] = body.slice(eq + 1);
			continue;
		}
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith('--')) {
			out[body] = next;
			i += 1;
		} else {
			out[body] = 'true';
		}
	}
	return out;
};

const splitList = (value: string | undefined): string[] =>
	value === undefined
		? []
		: value
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0);

const parseSurfaceMode = (value: string | undefined): IMcpToolSurfaceMode => {
	if (value === undefined) return 'managed';
	const mode = coerceSurfaceMode(value);
	if (mode !== undefined) return mode;
	throw new Error(
		`Invalid value for --surface: "${value}". Use --surface=managed, --surface=native, --surface=adaptive, or --surface=compact.`,
	);
};

/**
 * Parse an mcp-vertex argv (without the `node script` prefix) against a
 * working directory. Unknown `--key=value` flags land in `extra` and
 * are forwarded to every plugin, so a plugin like proposals can read
 * `--proposalsDir` without the core knowing about it.
 */
export const parseCliArgs = (
	argv: readonly string[],
	cwd: string,
): IMcpVertexCliArgs => {
	const tokens = tokenize(argv);
	const extra: Record<string, string> = {};
	for (const [key, value] of Object.entries(tokens)) {
		if (!KNOWN_KEYS.has(key)) extra[key] = value;
	}
	// Preset plugins first, then explicit --plugins; de-duped, order preserved.
	// `--exclude-plugins` is subtracted AFTER the merge, so the user can
	// strip a plugin from a preset (`--preset=swarm --exclude-plugins=notification`)
	// or drop an explicit one they don't want.
	const exclude = new Set([
		...splitList(tokens['exclude-plugins']),
		...splitList(tokens.excludePlugins),
	]);
	const presetPlugins = resolvePreset(tokens.preset).filter(
		(name) => !exclude.has(name),
	);
	const flagPlugins = splitList(tokens.plugins).filter(
		(name) => !exclude.has(name),
	);
	const plugins = [...new Set([...presetPlugins, ...flagPlugins])];
	return {
		plugins,
		presetPlugins,
		flagPlugins,
		excludePlugins: [...exclude],
		cacheDir: tokens.cacheDir ?? DEFAULT_CLI_ARGS.cacheDir,
		docsDir: tokens.docsDir ?? DEFAULT_CLI_ARGS.docsDir,
		workspace: resolvePath(cwd, tokens.workspace ?? '.'),
		surfaceMode: parseSurfaceMode(tokens.surface),
		startupReportLevel: tokens['startup-report'],
		serverName: tokens.name ?? DEFAULT_CLI_ARGS.serverName,
		serverVersion: tokens.serverVersion ?? DEFAULT_CLI_ARGS.serverVersion,
		namespacePrefix: tokens.prefix,
		configPath: tokens.config,
		mcpProjectCreate: !isFalse(tokens['mcp-project-create']),
		mcpProjectTests: !isFalse(tokens['mcp-project-tests']),
		agentWorktree: parseTriStateFlag(
			'--agent-worktree',
			tokens['agent-worktree'],
		),
		strictLogs: parseTriStateFlag('--strict-logs', tokens['strict-logs']),
		extra,
		tokens,
	};
};
