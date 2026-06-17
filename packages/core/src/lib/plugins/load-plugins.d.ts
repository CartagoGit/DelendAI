import type { IMcpPlugin, IMcpPluginContext, IMcpPluginRegistrations } from './plugin-contract';
export interface ILoadedPlugin {
    /** The specifier the user passed (`--plugins=<this>`). */
    readonly specifier: string;
    /** The module specifier that actually resolved. */
    readonly resolved: string;
    readonly plugin: IMcpPlugin;
    readonly registrations: IMcpPluginRegistrations;
}
export interface IPluginLoadResult {
    readonly loaded: readonly ILoadedPlugin[];
    readonly errors: ReadonlyArray<{
        readonly specifier: string;
        readonly message: string;
    }>;
}
export interface ILoadPluginsOptions {
    readonly specifiers: readonly string[];
    /** Build the per-plugin context once the plugin's name is known. */
    readonly buildContext: (pluginName: string) => IMcpPluginContext;
    /** Injectable importer (default: dynamic `import`). For tests. */
    readonly import?: (specifier: string) => Promise<unknown>;
    /** Per-step timeout (ms) for import and register. Default 15000. */
    readonly timeoutMs?: number;
}
/**
 * Turn a short plugin name into the module specifiers to try, in
 * order. A relative/absolute path or an explicit package path is used
 * verbatim; a bare short name (`proposals`) expands to the scoped
 * convention first (`@cartago-git/mcp-proposals`), then the bare name.
 */
export declare const resolvePluginSpecifier: (specifier: string) => string[];
/**
 * Resolve, import and register each requested plugin. One bad plugin
 * never aborts the rest: failures are collected in `errors` and the
 * server still boots with whatever loaded. Deterministic: plugins are
 * processed in the order requested.
 */
export declare const loadPlugins: (options: ILoadPluginsOptions) => Promise<IPluginLoadResult>;
