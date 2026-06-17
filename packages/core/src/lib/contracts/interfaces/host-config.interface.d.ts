import type { ICorePaths } from './core-paths.interface';
import type { IKnowledgeEntry, ISkillEntry } from './knowledge.interface';
import type { IMcpCoreServerMetadata } from './server-metadata.interface';
import type { IStatusCollector } from './status-collector.interface';
import type { IPromptRegistration, IResourceRegistration, IToolRegistration } from './tool-registration.interface';
import type { IValidationMatrix } from './validation-matrix.interface';
import type { IWorkspacePathProvider } from './workspace-paths.interface';
/**
 * Everything a host injects to assemble an MCP server on top of
 * mcp-core. The core is project-agnostic: it owns deterministic
 * registration and workspace resolution only. It knows NOTHING about
 * proposals, swarms, models or quality gates — those are plugin
 * concerns (see `IMcpPlugin`). The host (or the CLI plugin loader)
 * supplies metadata, the workspace, the resolved core paths and the
 * tool/prompt/resource/knowledge registrations to expose.
 */
export interface IMcpCoreHostConfig {
    readonly metadata: IMcpCoreServerMetadata;
    /**
     * Prefix for host tool names, e.g. `acme` → `acme_*`. Optional:
     * plugins namespace their own tools. mcp-core never invents tool
     * names outside a declared namespace.
     */
    readonly namespacePrefix?: string | undefined;
    readonly workspace: IWorkspacePathProvider;
    /**
     * Resolved cache/docs roots (from `--cacheDir`/`--docsDir`, or the
     * defaults). Plugins derive their own concrete layout from these.
     */
    readonly corePaths?: ICorePaths | undefined;
    readonly knowledge?: readonly IKnowledgeEntry[] | undefined;
    readonly skills?: readonly ISkillEntry[] | undefined;
    /** Optional quality-gate matrix exposed to agents (host-defined). */
    readonly validationMatrix?: IValidationMatrix | undefined;
    /** Host runtime status seams (anything with `collect()`). */
    readonly statusCollectors?: readonly IStatusCollector[] | undefined;
    /**
     * Tool registrations appended to (or anchored inside) the core
     * registration sequence. See `IToolRegistration.registerAfter`.
     */
    readonly extraTools?: readonly IToolRegistration[] | undefined;
    readonly extraPrompts?: readonly IPromptRegistration[] | undefined;
    readonly extraResources?: readonly IResourceRegistration[] | undefined;
}
