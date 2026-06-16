import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';

/**
 * Parsed mcp-core CLI invocation. Pure data so the loader and tests
 * never touch `process.argv` directly.
 */
export interface IMcpCoreCliArgs {
	/** Plugin specifiers from `--plugins=a,b` (comma or repeated flag). */
	readonly plugins: readonly string[];
	/** Scratch/state root (`--cacheDir`). */
	readonly cacheDir: string;
	/** Human-edited docs root (`--docsDir`). */
	readonly docsDir: string;
	/** Absolute workspace root (`--workspace`, default cwd). */
	readonly workspace: string;
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
	 * MCP server blueprint. `--mcp-server-create=false` disables it.
	 */
	readonly mcpServerCreate: boolean;
	/** Include tests in the blueprint. `--mcp-server-tests=false` to omit. */
	readonly mcpServerTests: boolean;
	/** Any other `--key=value` flags, forwarded to plugins via ctx.args. */
	readonly extra: Readonly<Record<string, string>>;
	/** The raw tokenized flags, so callers can detect what was explicit. */
	readonly tokens: Readonly<Record<string, string>>;
}

export const DEFAULT_CLI_ARGS = {
	cacheDir: DEFAULT_CORE_PATHS.cacheDir,
	docsDir: DEFAULT_CORE_PATHS.docsDir,
	serverName: 'mcp-core',
	serverVersion: '0.1.0',
} as const;

const KNOWN_KEYS = new Set([
	'plugins',
	'preset',
	'cacheDir',
	'docsDir',
	'workspace',
	'name',
	'serverVersion',
	'prefix',
	'config',
	'check',
	'doctor',
	'verbose',
	'mcp-server-create',
	'mcp-server-tests',
]);

// Curated plugin presets (additive). `--preset=standard` saves typing the
// full `--plugins` list; it merges with any explicit `--plugins`. [N18]
const STANDARD_PRESET = [
	'git',
	'search',
	'memory',
	'docs',
	'rules',
	'quality',
	'deps',
] as const;
export const PLUGIN_PRESETS: Readonly<Record<string, readonly string[]>> = {
	// read-only orientation, lightweight
	minimal: ['git', 'search'],
	// full single-agent toolkit
	standard: STANDARD_PRESET,
	// standard + multi-agent coordination
	swarm: [...STANDARD_PRESET, 'proposals', 'notification'],
};

/** Plugins for a preset name, or `[]` when the name is unknown. */
export const resolvePreset = (name: string | undefined): readonly string[] =>
	name === undefined ? [] : (PLUGIN_PRESETS[name] ?? []);

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

/**
 * Parse an mcp-core argv (without the `node script` prefix) against a
 * working directory. Unknown `--key=value` flags land in `extra` and
 * are forwarded to every plugin, so a plugin like proposals can read
 * `--proposalsDir` without the core knowing about it.
 */
export const parseCliArgs = (
	argv: readonly string[],
	cwd: string
): IMcpCoreCliArgs => {
	const tokens = tokenize(argv);
	const extra: Record<string, string> = {};
	for (const [key, value] of Object.entries(tokens)) {
		if (!KNOWN_KEYS.has(key)) extra[key] = value;
	}
	// Preset plugins first, then explicit --plugins; de-duped, order preserved.
	const plugins = [
		...new Set([
			...resolvePreset(tokens['preset']),
			...splitList(tokens['plugins']),
		]),
	];
	return {
		plugins,
		cacheDir: tokens['cacheDir'] ?? DEFAULT_CLI_ARGS.cacheDir,
		docsDir: tokens['docsDir'] ?? DEFAULT_CLI_ARGS.docsDir,
		workspace: tokens['workspace'] ?? cwd,
		serverName: tokens['name'] ?? DEFAULT_CLI_ARGS.serverName,
		serverVersion: tokens['serverVersion'] ?? DEFAULT_CLI_ARGS.serverVersion,
		namespacePrefix: tokens['prefix'],
		configPath: tokens['config'],
		mcpServerCreate: !isFalse(tokens['mcp-server-create']),
		mcpServerTests: !isFalse(tokens['mcp-server-tests']),
		extra,
		tokens,
	};
};
