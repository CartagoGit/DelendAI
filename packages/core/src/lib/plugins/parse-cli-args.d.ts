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
export declare const DEFAULT_CLI_ARGS: {
    readonly cacheDir: string;
    readonly docsDir: string;
    readonly serverName: "mcp-core";
    readonly serverVersion: "0.1.0";
};
export declare const PLUGIN_PRESETS: Readonly<Record<string, readonly string[]>>;
/** Plugins for a preset name, or `[]` when the name is unknown. */
export declare const resolvePreset: (name: string | undefined) => readonly string[];
/**
 * Parse an mcp-core argv (without the `node script` prefix) against a
 * working directory. Unknown `--key=value` flags land in `extra` and
 * are forwarded to every plugin, so a plugin like proposals can read
 * `--proposalsDir` without the core knowing about it.
 */
export declare const parseCliArgs: (argv: readonly string[], cwd: string) => IMcpCoreCliArgs;
