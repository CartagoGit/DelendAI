export interface IScaffoldedFile {
    readonly path: string;
    readonly content: string;
}
export interface IScaffoldHostOptions {
    /** Project display name, e.g. `Acme Quest`. */
    readonly projectName: string;
    /** Tool namespace, e.g. `acme` → `acme_*` tools. */
    readonly namespacePrefix: string;
    /** Package that will hold the host server, e.g. `@acme/mcp-server`. */
    readonly serverPackageName: string;
    /** Default agent model id. */
    readonly defaultModel?: string;
}
declare const SUBAGENT_SLOTS: readonly ["proposal_guardian", "implementation_runner", "delivery_verifier", "technical_investigator"];
export type IScaffoldAgentSlot = 'orchestrator' | (typeof SUBAGENT_SLOTS)[number];
export declare const scaffoldToolFile: (prefix: string, name: string, description: string) => IScaffoldedFile;
export declare const scaffoldPromptFile: (prefix: string, name: string, description: string) => IScaffoldedFile;
export declare const scaffoldSkillFile: (prefix: string, name: string, description: string, whenToUse?: readonly string[]) => IScaffoldedFile;
export declare const scaffoldAgentFile: (options: IScaffoldHostOptions, slot: IScaffoldAgentSlot) => IScaffoldedFile;
export declare const scaffoldInstructionsFile: (options: IScaffoldHostOptions) => IScaffoldedFile;
export declare const scaffoldHostConfigFile: (options: IScaffoldHostOptions) => IScaffoldedFile;
export declare const scaffoldServerEntryFiles: (options: IScaffoldHostOptions) => readonly IScaffoldedFile[];
/**
 * Everything a brand-new project needs: server entry + host config +
 * editor registration + orchestrator + 4 subagents + instructions +
 * a starter skill.
 */
export declare const scaffoldHostProject: (options: IScaffoldHostOptions) => readonly IScaffoldedFile[];
export interface IScaffoldPluginOptions {
    /** Plugin id, also the tool namespace and cache dir, e.g. `pepegrillo`. */
    readonly pluginName: string;
    /** One-line, model-agnostic description of what the plugin adds. */
    readonly description: string;
    /** npm scope for the package name (default `@cartago-git`). */
    readonly scope?: string;
}
/**
 * Generate a ready-to-load plugin package implementing `IMcpPlugin`.
 * The result is loadable with `mcp-core --plugins=<pluginName>` once
 * published or linked. Tools are namespaced by the plugin name and
 * return structured JSON so any agent/model can consume them.
 */
export declare const scaffoldPluginFiles: (options: IScaffoldPluginOptions) => readonly IScaffoldedFile[];
export interface IScaffoldClientOptions {
    /** Client id, e.g. `acme`. */
    readonly clientName: string;
    /** One-line description of the client. */
    readonly description: string;
    /** npm scope (default `@cartago-git`). */
    readonly scope?: string;
    /** Command the client spawns to reach the server (default `bunx`). */
    readonly serverCommand?: string;
    /** Args for that command (default loads mcp-core with no plugins). */
    readonly serverArgs?: readonly string[];
}
/**
 * Generate a reusable MCP **client** library: it connects (stdio) to an
 * MCP server and exposes its tools as typed functions, so other
 * libraries — and the agents that use them — can consume that server
 * programmatically. This is the counterpart of the host/server
 * scaffolds: build servers with `kind:host`, build consumers with
 * `kind:client`.
 */
export declare const scaffoldClientFiles: (options: IScaffoldClientOptions) => readonly IScaffoldedFile[];
export {};
