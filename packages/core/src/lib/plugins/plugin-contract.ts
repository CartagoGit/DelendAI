import type { ICorePaths } from '../contracts/interfaces/core-paths.interface';
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
