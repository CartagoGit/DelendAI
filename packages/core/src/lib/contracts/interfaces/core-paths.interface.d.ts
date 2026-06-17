/**
 * The two workspace-relative roots the core resolves from the CLI and
 * hands to every plugin. Plugins derive their own concrete layout from
 * these (e.g. the swarm plugin builds its lock/queue/proposal paths
 * from `cacheDir`/`docsDir`). Both are relative to the workspace root
 * resolved by `IWorkspacePathProvider`.
 */
export interface ICorePaths {
    /**
     * Scratch/state root for transient artefacts.
     * CLI: `--cacheDir` (default `.cache/mcp-core`).
     */
    readonly cacheDir: string;
    /**
     * Human-edited document root (proposals, generated guides, etc.).
     * CLI: `--docsDir` (default `docs/mcp-core`).
     */
    readonly docsDir: string;
}
/** Default core roots when the CLI is run without overrides. */
export declare const DEFAULT_CORE_PATHS: ICorePaths;
