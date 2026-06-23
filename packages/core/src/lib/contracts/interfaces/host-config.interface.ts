import type { ICorePaths } from './core-paths.interface';
import type { IKnowledgeEntry, ISkillEntry } from './knowledge.interface';
import type { IMcpVertexProjectMetadata } from './project-metadata.interface';
import type { IStatusCollector } from './status-collector.interface';
import type { IMetricsRegistry } from '../../metrics/metrics-registry';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from './tool-registration.interface';
import type { IValidationMatrix } from './validation-matrix.interface';
import type { IWorkspacePathProvider } from './workspace-paths.interface';

/**
 * Solid-ISP (2026-06-23): `IMcpVertexHostConfig` used to be a single
 * 14-field mega-interface that forced every consumer to know every
 * concern (identity, paths, knowledge, observability, extra
 * registrations). It is now the **composite** of five
 * single-purpose sub-interfaces, each independently consumable:
 *
 *   - `IHostIdentity`     — server name / version / namespace prefix.
 *   - `IHostPaths`        — workspace + resolved core paths + legacy flag.
 *   - `IHostContent`      — knowledge entries, skills, validation matrix.
 *   - `IHostObservability`— status collectors, metrics registry, lifecycle hooks.
 *   - `IHostRegistrations`— extra tool / prompt / resource registrations.
 *
 * The composite `IMcpVertexHostConfig` is the **union** of every
 * sub-interface (it `extends` each one). Existing callers that
 * pass the composite keep working; new callers that only need a
 * slice can depend on the relevant sub-interface (e.g. tests can
 * build a minimal `IHostIdentity + IHostPaths` without knowing
 * anything about metrics or knowledge).
 */

/** Solid-ISP: server identity + namespace prefix. */
export interface IHostIdentity {
	readonly metadata: IMcpVertexProjectMetadata;
	/**
	 * Prefix for host tool names, e.g. `acme` → `acme_*`. Optional:
	 * plugins namespace their own tools. mcp-vertex never invents tool
	 * names outside a declared namespace.
	 */
	readonly namespacePrefix?: string | undefined;
}

/** Solid-ISP: workspace + resolved core paths + scaffold-preservation toggle. */
export interface IHostPaths {
	readonly workspace: IWorkspacePathProvider;
	/**
	 * Resolved cache/docs roots (from `--cacheDir`/`--docsDir`, or the
	 * defaults). Plugins derive their own concrete layout from these.
	 */
	readonly corePaths?: ICorePaths | undefined;
	/**
	 * Default false. When true, scaffold regeneration preserves existing files
	 * under legacy/ before writing fresh templates.
	 */
	readonly keepLegacy?: boolean | undefined;
}

/** Solid-ISP: agent-facing static content the host wants to expose. */
export interface IHostContent {
	readonly knowledge?: readonly IKnowledgeEntry[] | undefined;
	readonly skills?: readonly ISkillEntry[] | undefined;
	/** Optional quality-gate matrix exposed to agents (host-defined). */
	readonly validationMatrix?: IValidationMatrix | undefined;
}

/** Solid-ISP: runtime observability seams. */
export interface IHostObservability {
	/** Host runtime status seams (anything with `collect()`). */
	readonly statusCollectors?: readonly IStatusCollector[] | undefined;
	/**
	 * Optional metrics registry. When set, every tool handler is wrapped to
	 * record latency/bytes/errors into it. The CLI wires this to the
	 * `<prefix>_metrics` tool; programmatic hosts opt in by passing one.
	 */
	readonly metricsRegistry?: IMetricsRegistry | undefined;
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

/** Solid-ISP: extra registrations the host wants to anchor. */
export interface IHostRegistrations {
	/**
	 * Tool registrations appended to (or anchored inside) the core
	 * registration sequence. See `IToolRegistration.registerAfter`.
	 */
	readonly extraTools?: readonly IToolRegistration[] | undefined;
	readonly extraPrompts?: readonly IPromptRegistration[] | undefined;
	readonly extraResources?: readonly IResourceRegistration[] | undefined;
}

/**
 * Everything a host injects to assemble an MCP server on top of
 * mcp-vertex. The core is project-agnostic: it owns deterministic
 * registration and workspace resolution only. It knows NOTHING about
 * proposals, swarms, models or quality gates — those are plugin
 * concerns (see `IMcpPlugin`). The host (or the CLI plugin loader)
 * supplies metadata, the workspace, the resolved core paths and the
 * tool/prompt/resource/knowledge registrations to expose.
 *
 * Solid-ISP: this composite is the union of five sub-interfaces;
 * callers that only need a slice can depend on the slice directly.
 */
export interface IMcpVertexHostConfig
	extends IHostIdentity,
		IHostPaths,
		IHostContent,
		IHostObservability,
		IHostRegistrations {}
