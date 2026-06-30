import type { ICorePaths } from '../contracts/interfaces/core-paths.interface';
import type { ICommitAuthorResolution } from '../shared/commit-author';
import type { IPluginConfigExample } from '../contracts/interfaces/plugin-config-example.interface';
import type {
	IKnowledgeEntry,
	ISkillEntry,
} from '../contracts/interfaces/knowledge.interface';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { ICacheEvictionRegistry } from '../contracts/interfaces/cache-eviction.interface';

/**
 * What the core hands a plugin at registration time. A plugin is
 * pure: given this context it returns the artefacts to expose. It must
 * not call `process.cwd()` or read CLI args directly — everything it
 * needs is here, already resolved, so the same plugin behaves
 * identically under any agent, model or host.
 */
export interface IMcpPluginContext {
	/** Absolute workspace root resolver (never hardcode paths). */
	readonly workspace: IWorkspacePathProvider;
	/** Resolved cache/docs roots (workspace-relative). */
	readonly corePaths: ICorePaths;
	/** Shorthand for `corePaths.cacheDir`. */
	readonly cacheDir: string;
	/** Shorthand for `corePaths.docsDir`. */
	readonly docsDir: string;
	/**
	 * Global preservation preference from `mcp-vertex.config.json`.
	 * Default false: generated scaffolds skip existing files. Plugins that
	 * regenerate durable project files may opt in to legacy snapshots when true.
	 */
	readonly keepLegacy: boolean;
	/**
	 * Host-scoped capability gate for `agent_worktree`, resolved at boot
	 * (host CLI `--agent-worktree` > `mcp-vertex.config.json#agentWorktree`
	 * > `false`). The CLI loader always sets a concrete boolean; it is
	 * additive/optional on the contract so existing programmatic hosts and
	 * test fixtures that build a context literal keep compiling. A plugin
	 * that offers per-agent git worktrees (proposals) reads this to decide
	 * whether the capability is live, treating absent/`false` as disabled
	 * (default off); when disabled it must refuse the operation with a
	 * structured error instead of running the engine.
	 */
	readonly agentWorktreeEnabled?: boolean | undefined;
	/** This plugin's private cache root: `<cacheDir>/<plugin>`. */
	readonly pluginCacheDir: string;
	/** This plugin's docs root: `<docsDir>/<plugin>`. */
	readonly pluginDocsDir: string;
	/** Tool namespace for this plugin (default: the plugin name). */
	readonly namespacePrefix: string;
	/**
	 * Typed, structured options for THIS plugin, read from the
	 * `mcp-vertex.config.json` file under `plugins.<name>.options`. May
	 * hold nested objects/arrays — anything JSON. Empty when no config
	 * file (or no entry for this plugin) is present.
	 */
	readonly options: Readonly<Record<string, unknown>>;
	/** Extra global CLI args not consumed by the core, e.g. `--foo=x`. */
	readonly args: Readonly<Record<string, string>>;
	/**
	 * Cache eviction registry — f00072 slice S1. Plugins contribute
	 * rules via `ctx.cacheEvictionRegistry.register(rule)` during their
	 * `register()` hook; the core boot sweep runs a dry-run after every
	 * plugin has loaded (see `assemble.ts`). The registry is the same
	 * instance every plugin receives within a single boot, so two
	 * plugins can collaborate without each owning a separate scheduler.
	 *
	 * Optional on the contract for backward-compatibility with existing
	 * test fixtures that build a context literal by hand. Production
	 * hosts always supply it.
	 */
	readonly cacheEvictionRegistry?: ICacheEvictionRegistry | undefined;
	/** Resolved commit-author policy (f00082). */
	readonly commitAuthor?: ICommitAuthorResolution | undefined;
	/**
	 * Names of every plugin that successfully registered in the same
	 * boot (the "peer plugins"). The value is **lazy**: at register
	 * time this is `[]` (the load happens after register), but the
	 * core mutates the underlying storage once every plugin has
	 * finished so handler invocations see the final peer list. A
	 * plugin that needs to make a runtime decision based on whether
	 * a peer is loaded (e.g. an audit plugin deciding whether to
	 * auto-scaffold proposals based on whether the proposals plugin
	 * is available) MUST read this lazily — never snapshot it at
	 * register time.
	 *
	 * Backed by {@link IPeerPluginRegistry} so the list is shared
	 * across the same boot and stays `readonly` from the plugin's
	 * perspective. Kept optional on the contract for backwards-compat
	 * with test fixtures that build a context literal by hand —
	 * treat absent as a no-op registry (always empty).
	 */
	readonly peerPlugins?: IPeerPluginRegistry | undefined;
}

/**
 * Shared, mutable container for the names of every plugin that
 * successfully registered in the current boot. Populated by the core
 * once `loadPlugins()` completes. Plugins read it via
 * `ctx.peerPlugins.list()` from inside their tool handlers so they
 * see the final peer list — at register time the list is still
 * empty because the load has not finished yet.
 */
export interface IPeerPluginRegistry {
	/** Snapshot of the currently-loaded peer names. */
	readonly list: () => readonly string[];
	/** True iff the given plugin name is in the loaded peer set. */
	readonly has: (name: string) => boolean;
}

/**
 * Everything a plugin contributes to the assembled server. All fields
 * optional so a plugin can ship just tools, just knowledge, etc.
 */
export interface IMcpPluginRegistrations {
	readonly tools?: readonly IToolRegistration[];
	readonly prompts?: readonly IPromptRegistration[];
	readonly resources?: readonly IResourceRegistration[];
	readonly knowledge?: readonly IKnowledgeEntry[];
	readonly skills?: readonly ISkillEntry[];
	readonly onToolCall?:
		| ((
				toolName: string,
				args: unknown,
				result: unknown,
				error?: unknown,
		  ) => Promise<void> | void)
		| undefined;
	readonly onToolStart?:
		| ((toolName: string, args: unknown) => Promise<void> | void)
		| undefined;
	readonly isAgentStuck?:
		| ((
				toolName: string,
				args: unknown,
		  ) => { handoffPath: string; suggestedAction: string } | null)
		| undefined;
}

/**
 * The contract every mcp-vertex plugin implements. A plugin package's
 * entry module must `export default` one of these (or a factory that
 * returns one). Resolved by name via the CLI: `mcp-vertex --plugins=foo`
 * loads `@mcp-vertex/foo`, a bare npm name, or a local path.
 */
export interface IMcpPlugin {
	/** Stable plugin id; also the default tool namespace and cache dir. */
	readonly name: string;
	readonly version?: string;
	/** One-line, model-agnostic description of what the plugin adds. */
	readonly describe?: string;
	/**
	 * Other plugin ids (by `name`) this plugin requires to be present in
	 * the same load set. Additive/optional: most plugins have no
	 * dependencies. The loader (`load-plugins.ts`) refuses the entire
	 * batch — no partial registration — if any loaded plugin names a
	 * dependency that is not also being loaded, collecting every missing
	 * dependency into a single combined error instead of failing one at
	 * a time. Declaring this is the plugin's job; enforcing it is the
	 * loader's (see `checkPluginDependencies`).
	 */
	readonly dependsOn?: readonly string[];
	/**
	 * Optional schema validating `ctx.options` (from the config file).
	 * Any object exposing zod's `safeParse` works — declaring it lets
	 * the loader reject misconfigured options with a clear error before
	 * `register` runs, and the `--check` doctor report it.
	 */
	readonly optionsSchema?: {
		safeParse(value: unknown): {
			success: boolean;
			error?: unknown;
		};
	};
	/**
	 * Optional example config for the docs site. When present, the
	 * `/plugins/<slug>` page renders a copy-pasteable JSON snippet with
	 * the plugin's typical options pre-filled. Plugins without a
	 * `configExample` simply skip the Configuration section on their
	 * page. See l100 s6 and `IPluginConfigExample`.
	 */
	readonly configExample?: IPluginConfigExample;
	register(
		ctx: IMcpPluginContext,
	): IMcpPluginRegistrations | Promise<IMcpPluginRegistrations>;
}

/** Identity helper for type-safe plugin authoring and inference. */
export const definePlugin = (plugin: IMcpPlugin): IMcpPlugin => plugin;
