import type { IMcpCoreHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpCoreCliArgs } from '../plugins/parse-cli-args';
export interface IAssembledCliConfig {
    readonly config: IMcpCoreHostConfig;
    readonly loadResult: IPluginLoadResult;
    /** Config-file diagnostic from the SAME read used to assemble (so the
     *  doctor doesn't read the file twice). [N21] */
    readonly configDiagnostic: {
        readonly present: boolean;
        readonly issues: readonly string[];
    };
    /** Absolute path of the resolved config file. */
    readonly configPath: string;
}
export interface IAssembleCliDeps {
    /** Injectable plugin importer (default: dynamic `import`). */
    import?: (specifier: string) => Promise<unknown>;
    /** Injectable config-file reader (default: node fs). */
    readFile?: (absolutePath: string) => string | undefined;
}
/**
 * Build the full host config from parsed CLI args: resolve the
 * workspace and core paths (CLI flag > config file > default), load
 * every `--plugins` entry passing each its `mcp-core.config.json`
 * options, merge the registrations, and always expose the core
 * meta-tools (scaffold + the hybrid analyze/create_server bootstrap).
 * Pure except for the injectable importer/reader, so it is fully
 * testable.
 */
export declare const assembleCliConfig: (args: IMcpCoreCliArgs, deps?: IAssembleCliDeps) => Promise<IAssembledCliConfig>;
export interface IDoctorReport {
    readonly ok: boolean;
    readonly configPath: string;
    readonly config: {
        readonly present: boolean;
        readonly issues: readonly string[];
    };
    readonly paths: {
        readonly cacheDir: string;
        readonly docsDir: string;
    };
    readonly plugins: {
        readonly requested: readonly string[];
        readonly loaded: readonly string[];
        readonly errors: readonly string[];
    };
    readonly counts: {
        readonly tools: number;
        readonly prompts: number;
        readonly resources: number;
    };
    /** True if the real MCP server assembled without registration errors. */
    readonly assembles: boolean;
    readonly assemblyError?: string;
}
/**
 * `--check` diagnostics: validate the config file, resolve and load
 * every requested plugin, and report what the server WOULD expose —
 * without starting the stdio transport. The fast way to debug a setup
 * in any environment before wiring it into a client.
 */
export declare const runDoctor: (args: IMcpCoreCliArgs, deps?: IAssembleCliDeps) => Promise<IDoctorReport>;
/**
 * First-start hook: analyze the project and persist an EXHAUSTIVE
 * blueprint for a project-specific MCP server to the cache, so an agent
 * can review and materialise it. Idempotent (writes once) and never
 * writes into the repo itself. Skipped by `--mcp-server-create=false`.
 * If a server already exists, the blueprint's notes explain how to
 * integrate it with mcp-core organically.
 */
export declare const prepareServerBlueprintOnStart: (args: IMcpCoreCliArgs) => Promise<{
    written: boolean;
    path: string;
}>;
/** Entry point for the `mcp-core` bin. */
export interface IAssemblyDiagnostics {
    readonly workspace: string;
    readonly cacheDir: string;
    readonly docsDir: string;
    readonly plugins: {
        readonly requested: readonly string[];
        readonly loaded: ReadonlyArray<{
            readonly name: string;
            readonly version?: string;
        }>;
        readonly errors: readonly string[];
    };
    readonly counts: {
        readonly tools: number;
        readonly prompts: number;
        readonly resources: number;
    };
    readonly registrationOrder: readonly string[];
}
/** Pure: assemble a diagnostics snapshot of what the server will expose. */
export declare const buildAssemblyDiagnostics: (args: IMcpCoreCliArgs, loadResult: IPluginLoadResult, config: IMcpCoreHostConfig, registrationOrder: readonly string[]) => IAssemblyDiagnostics;
/** Pure: render diagnostics as stderr lines (stdout is the MCP transport). */
export declare const formatVerbose: (d: IAssemblyDiagnostics) => string;
export declare const runCli: (argv: readonly string[], cwd: string) => Promise<void>;
