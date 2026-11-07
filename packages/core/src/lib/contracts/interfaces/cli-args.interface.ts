/**
 * Type contracts moved out of `lib/plugins/parse-cli-args.ts`.
 *
 * Declared here rather than beside the implementation because
 * `@delendai/core/contracts` re-exports it, and TypeScript type-checks
 * the whole target module to resolve a type — so re-exporting from the
 * implementation dragged its `node:*` imports into every consumer that
 * compiles without `@types/node`, which is the audience the `contracts`
 * subpath exists to serve.
 */
import type { IMcpToolSurfaceMode } from './surface-mode.interface';

/**
 * Parsed delendai CLI invocation. Pure data so the loader and tests
 * never touch `process.argv` directly.
 */
export interface IDelendaiCliArgs {
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
