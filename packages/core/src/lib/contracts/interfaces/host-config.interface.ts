import type { ICorePaths } from './core-paths.interface';
import type { ICommitAuthorResolution } from './commit-author.interface';
import type { IKnowledgeEntry, ISkillEntry } from './knowledge.interface';
import type { IDelendaiProjectMetadata } from './project-metadata.interface';
import type { IStatusCollector } from './status-collector.interface';
import type { IMetricsRegistry } from '../../metrics/metrics-registry';
import type { IRuntimeEventSink } from '../../observability/runtime-events';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from './tool-registration.interface';
import type { IValidationMatrix } from './validation-matrix.interface';
import type { IWorkspacePathProvider } from './workspace-paths.interface';
import type {
	IToolSurfacePlan,
	IToolSurfaceRuntimeAccess,
} from './tool-surface.interface';
import type { IErrorCollector } from '../../error-collection/collector.interface';

/**
 * Solid-ISP (2026-06-23): `IDelendaiHostConfig` used to be a single
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
 * The composite `IDelendaiHostConfig` is the **union** of every
 * sub-interface (it `extends` each one). Existing callers that
 * pass the composite keep working; new callers that only need a
 * slice can depend on the relevant sub-interface (e.g. tests can
 * build a minimal `IHostIdentity + IHostPaths` without knowing
 * anything about metrics or knowledge).
 */

/** Solid-ISP: server identity + namespace prefix. */
export interface IHostIdentity {
	readonly metadata: IDelendaiProjectMetadata;
	/**
	 * Prefix for host tool names, e.g. `acme` → `acme_*`. Optional:
	 * plugins namespace their own tools. delendai never invents tool
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
	/**
	 * Host-scoped `agent_worktree` capability, resolved at boot (host CLI
	 * `--agent-worktree` > `delendai.config.json#agentWorktree` >
	 * `false`). Surfaced on the host config so an a00036-style audit can
	 * confirm the effective value without re-reading the CLI parser.
	 * Optional on the interface (programmatic hosts may omit it); the CLI
	 * loader always sets a concrete boolean.
	 */
	readonly agentWorktreeEnabled?: boolean | undefined;
	/**
	 * f00082: the resolved commit-author policy, applied by the shared
	 * git engine to every commit produced by `@delendai/git` and
	 * `@delendai/proposals#auto_work`. The CLI loader builds this
	 * from `delendai.config.json#commitAuthor` (mode + identity +
	 * human-name/email) and the MCP `clientInfo` payload. Optional on
	 * the interface so existing programmatic hosts keep compiling —
	 * when absent, the engine falls back to the active git config
	 * (the historical default).
	 */
	readonly commitAuthor?: ICommitAuthorResolution | undefined;
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
	/** Optional host-neutral JSONL/event sink outside MCP stdio. */
	readonly runtimeEventSink?: IRuntimeEventSink | undefined;
	/**
	 * f00251 — assembled cross-plugin error collector. When present, the
	 * shared tool-registration wrapper captures thrown handler errors into it
	 * before re-throwing so MCP transport semantics stay unchanged.
	 */
	readonly errorCollector?: IErrorCollector | undefined;
	/** Host runtime status seams (anything with `collect()`). */
	readonly statusCollectors?: readonly IStatusCollector[] | undefined;
	/**
	 * Optional metrics registry. When set, every tool handler is wrapped to
	 * record latency/bytes/errors into it. The CLI wires this to the
	 * `<prefix>_metrics` tool; programmatic hosts opt in by passing one.
	 */
	readonly metricsRegistry?: IMetricsRegistry | undefined;
	/**
	 * `elapsedMs` is the wall-clock duration of the handler call
	 * (success or failure), always fired exactly once in the
	 * handler's `finally` block. Distinct from `onToolCancel`'s
	 * `elapsedMs`, which fires at most once and only when the
	 * client aborts mid-flight.
	 */
	readonly onToolCall?:
		| ((
				toolName: string,
				args: unknown,
				result: unknown,
				error?: unknown,
				elapsedMs?: number,
		  ) => Promise<void> | void)
		| undefined;
	readonly onToolStart?:
		| ((toolName: string, args: unknown) => Promise<void> | void)
		| undefined;
	/**
	 * f00111 S1: fired when the client aborts an in-flight tool call (the
	 * SDK request `AbortSignal` fires while the handler is still running).
	 * `elapsedMs` is the time since the handler started. At most once per
	 * call; never fired after the handler settles.
	 */
	readonly onToolCancel?:
		| ((
				toolName: string,
				args: unknown,
				elapsedMs: number,
				context?: {
					readonly reason: string;
					readonly nextAction: string;
					readonly error: unknown;
				},
		  ) => Promise<void> | void)
		| undefined;
	readonly onHookError?:
		| ((
				info: import('./plugin-lifecycle-error.interface').IPluginHookErrorInfo,
		  ) => Promise<void> | void)
		| undefined;
	readonly isAgentStuck?:
		| ((
				toolName: string,
				args: unknown,
		  ) => { handoffPath: string; suggestedAction: string } | null)
		| undefined;
	/**
	 * f00156: merged checkpoint-advisory provider (highest severity
	 * across plugins). Optional so existing programmatic hosts compile.
	 */
	readonly getCheckpointAdvisory?:
		| import('./checkpoint-advisory.interface').CheckpointAdvisoryProvider
		| undefined;
	/**
	 * f00156: merged pre-handler hook. `severity: 'block'` short-circuits
	 * the tool handler. Optional so existing hosts compile.
	 */
	readonly beforeToolCall?:
		| import('./checkpoint-advisory.interface').BeforeToolCallHook
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
	/** Optional runtime plan/access pair for adaptive/compact tool surfaces. */
	readonly toolSurfacePlan?: IToolSurfacePlan | undefined;
	readonly toolSurfaceRuntime?: IToolSurfaceRuntimeAccess | undefined;
	/** Managed-only tool activators keyed by their stable registration id. */
	readonly lazyToolActivators?: ReadonlyMap<
		string,
		() => Promise<
			import('./tool-surface.interface').IToolSurfaceLazyBinding
		>
	>;
	/** Managed-only plugin loaders used by explicit plugin activation. */
	readonly lazyPluginActivators?:
		| ReadonlyMap<string, () => Promise<void>>
		| undefined;
	/**
	 * Drains non-tool registrations produced by managed lazy activation.
	 * The project registers them after the first routed use; their bodies are
	 * therefore absent from cold start but remain available through MCP-native
	 * prompt/resource registration once their owning plugin is needed.
	 */
	readonly consumeLazyPluginRegistrations?:
		| (() => readonly {
				readonly prompts?: readonly IPromptRegistration[] | undefined;
				readonly resources?:
					| readonly IResourceRegistration[]
					| undefined;
				readonly knowledge?: readonly IKnowledgeEntry[] | undefined;
		  }[])
		| undefined;
	/**
	 * Dispose every plugin runtime this host activated, in reverse
	 * activation order, aggregating per-plugin failures rather than
	 * throwing on the first one. `createMcpProject`'s returned
	 * `dispose()` is the sole caller (AUD-E02 / r00039) — nobody else
	 * should invoke this directly, since it is not itself idempotent
	 * across independent callers racing each other.
	 */
	readonly disposePlugins?:
		| (() => Promise<
				readonly {
					readonly pluginName: string;
					readonly error: unknown;
				}[]
		  >)
		| undefined;
	/**
	 * Dispose exactly one plugin's runtime, by plugin id (x00286 S4).
	 * `createMcpProject` wires this into
	 * `toolSurfaceRuntime.setPluginDisposer` so `evictIdlePlugins`'s
	 * eviction has a real per-plugin dispose to call instead of only
	 * relazying the tool. Present only for the managed-lazy assembly —
	 * eager plugins are never evictable, so there is nothing to wire.
	 */
	readonly disposePlugin?: (pluginId: string) => Promise<void>;
}

/**
 * Everything a host injects to assemble an MCP server on top of
 * delendai. The core is project-agnostic: it owns deterministic
 * registration and workspace resolution only. It knows NOTHING about
 * proposals, swarms, models or quality gates — those are plugin
 * concerns (see `IMcpPlugin`). The host (or the CLI plugin loader)
 * supplies metadata, the workspace, the resolved core paths and the
 * tool/prompt/resource/knowledge registrations to expose.
 *
 * Solid-ISP: this composite is the union of five sub-interfaces;
 * callers that only need a slice can depend on the slice directly.
 */
export interface IDelendaiHostConfig
	extends IHostIdentity,
		IHostPaths,
		IHostContent,
		IHostObservability,
		IHostRegistrations {}
