import type { ICorePaths } from '../contracts/interfaces/core-paths.interface';
import type { ICommitAuthorResolution } from '../contracts/interfaces/commit-author.interface';
import type { IResolvedHostIdentity } from '../contracts/interfaces/resolved-host-identity.interface';
import type { IPluginConfigExample } from '../contracts/interfaces/plugin-config-example.interface';
import type {
	IKnowledgeEntry,
	ISkillEntry,
} from '../contracts/interfaces/knowledge.interface';
import type { IToolIdentityRegistry } from '../contracts/interfaces/safe-tool-identity.interface';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { ICacheEvictionRegistry } from '../contracts/interfaces/cache-eviction.interface';
import type { IActivationContribution } from '../contracts/interfaces/activation-report.interface';
import type {
	IPluginHookErrorInfo,
	IPluginRegisterErrorInfo,
} from '../contracts/interfaces/plugin-lifecycle-error.interface';
import type { IPluginRuntime } from '../contracts/interfaces/plugin-runtime.interface';
import type { IErrorSink } from '../error-collection/sink.interface';
import type { IErrorCollector } from '../error-collection/collector.interface';
import type { IPluginEffectsCapability } from '../contracts/interfaces/effect-capabilities.interface';
import type { StateRegistry } from '@delendai/state';

/**
 * What the core hands a plugin at registration time. A plugin is
 * pure: given this context it returns the artefacts to expose. It must
 * not read the process working directory or CLI args directly - everything it
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
	 * Global preservation preference from `delendai.config.json`.
	 * Default false: generated scaffolds skip existing files. Plugins that
	 * regenerate durable project files may opt in to legacy snapshots when true.
	 */
	readonly keepLegacy: boolean;
	/**
	 * Host-scoped capability gate for `agent_worktree`, resolved at boot
	 * (host CLI `--agent-worktree` > `delendai.config.json#agentWorktree`
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
	/** Resolve a path strictly below this plugin's private cache root. */
	readonly cachePath?: (relativePath?: string) => string;
	/** This plugin's docs root: `<docsDir>/<plugin>`. */
	readonly pluginDocsDir: string;
	/** Tool namespace for this plugin (default: the plugin name). */
	readonly namespacePrefix: string;
	/**
	 * Typed, structured options for THIS plugin, read from the
	 * `delendai.config.json` file under `plugins.<name>.options`. May
	 * hold nested objects/arrays — anything JSON. Empty when no config
	 * file (or no entry for this plugin) is present.
	 */
	readonly options: Readonly<Record<string, unknown>>;
	/**
	 * Effective options for every plugin selected in this boot. This is a
	 * read-only configuration view for cross-plugin compatibility checks;
	 * plugins must never mutate or reinterpret another plugin's options.
	 */
	readonly pluginOptions?: ReadonlyMap<
		string,
		Readonly<Record<string, unknown>>
	>;
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
	 * Boot-resolved host identity (f00082 S3): the client/IDE (`host`) and
	 * `model` driving this process, resolved once at assembly from the same
	 * source as {@link commitAuthor} (`delendai.config.json#commitAuthor` or
	 * the `agent-client`/`agent-model` args). A plugin that records who did a
	 * piece of work (the proposals swarm registry) uses this as the DEFAULT
	 * identity when a per-call `host`/`model` argument is absent, so an
	 * orchestrator declares itself once at boot instead of on every call.
	 *
	 * Present ONLY when the host actually declared an identity; absent
	 * otherwise, so consumers keep their `null`/legacy fallback and behaviour
	 * stays byte-identical for hosts that declare nothing. Optional on the
	 * contract for backward-compat with test fixtures that build a context
	 * literal by hand.
	 */
	readonly hostIdentity?: IResolvedHostIdentity | undefined;
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
	/**
	 * f00153 S4 — incident helper exposed by the `logs` plugin. A
	 * peer plugin emits a structured incident by calling
	 * `ctx.logs?.log({ severity, incidentType, message, files?, agent?, context? })`;
	 * the helper is the same writer the `logs_log` MCP tool uses, so
	 * an entry lands in the redacted main timeline with `severity` and
	 * `incidentType` set, ready for `query` / `search` / `incidents`.
	 *
	 * Conditional on the `logs` plugin being loaded. Plugins MUST null-
	 * check (`ctx.logs?.log(...)`) — when the `logs` plugin is absent,
	 * the helper is undefined and the call is a no-op.
	 */
	readonly logs?: IPluginLogsHelper | undefined;
	/**
	 * f00154 S2 — the raw event sink the core uses for tool-call
	 * lifecycle events. Plugins that want to write a fully-shaped
	 * `ISinkEvent` (rather than the typed `IPluginLogInput` shortcut
	 * of `ctx.logs.log(...)`) read this directly. The core ALWAYS
	 * picks a sink at boot: if the `logs` plugin is in the load set,
	 * the sink delegates to it; otherwise a `ConsoleLogsSink` writes
	 * redacted JSON lines to stderr so no event is silently dropped.
	 */
	readonly logsSink?: ILogsSink | undefined;
	/**
	 * f00251 — the error collector the host has assembled from every
	 * plugin's errorSinks. When no plugin contributes one, the core
	 * injects a ConsoleErrorSink fallback so the field is never
	 * undefined in production hosts.
	 */
	readonly errorCollector?: IErrorCollector | undefined;
	/**
	 * Read-only registry of public-safe tool provenance. The core populates it
	 * after assembling the tool surface; plugins must not infer provenance from
	 * arbitrary tool-name strings.
	 */
	readonly toolRegistry?: IToolIdentityRegistry | undefined;
	/**
	 * Dry-run-gated mutating capabilities. A plugin that writes git
	 * history (or, as this
	 * surface grows, the filesystem/network/spawn) MUST obtain that
	 * capability from here rather than importing `node:child_process` /
	 * `node:fs` / `fetch` directly: every method on `effects` refuses to
	 * run its real effect while the CURRENT tool call's `args.dryRun` is
	 * `true`, even if the plugin's own handler never reads that flag
	 * (see `dry-run/effect-guard.helper.ts` and
	 * `dry-run/dry-run-scope.helper.ts`). Optional on the contract for
	 * backward-compat with test fixtures that build a context literal by
	 * hand — production hosts (the CLI's `assemble.ts`) always supply a
	 * concrete value. A plugin that requires it (e.g. `git`'s write
	 * tools) should refuse to register its mutating tools rather than
	 * silently falling back to an unguarded capability when this is
	 * absent.
	 */
	readonly effects?: IPluginEffectsCapability | undefined;
	/**
	 * q00018 — Phase 0 State Engine registry. The core hands every
	 * plugin the same singleton `IStateRegistry` from
	 * `@delendai/state`; Phase 0 ships the in-memory driver, Phase 1
	 * will introduce the SQLite driver behind the same contract. A
	 * plugin that wants to project canonical state (proposals,
	 * package graph, routing, etc.) registers an `IStateProducer`
	 * via `ctx.state.defineProducer(...)` and reads via
	 * `ctx.state.get(...)`.
	 *
	 * Pure-hydrate invariant: producers MUST NOT mutate source.
	 * The lint `tools/scripts/lint/state-engine-purity.script.ts`
	 * enforces the boundary statically; the property tests in
	 * `@delendai/state` enforce the dynamic side. The plugin
	 * documentation MUST link this invariant when a producer reads
	 * or writes durable project files.
	 *
	 * Optional on the contract for backward-compat with test
	 * fixtures that build a context literal by hand. Production
	 * hosts (`assemble.ts`) always supply a concrete registry; a
	 * plugin that needs the registry MUST null-check
	 * (`ctx.state?.defineProducer(...)`) and refuse the operation
	 * with a structured error when the field is absent.
	 */
	readonly state?: StateRegistry | undefined;
}

/**
 * f00154 S2 — see `logs-sink.ts` for the full contract. Re-exported
 * from the contract so plugin authors can type their handlers
 * without importing the internal path.
 */
export interface ILogsSink {
	readonly id: string;
	readonly record: (event: ISinkEvent) => Promise<void>;
}

/**
 * f00154 S2 — the shape the core passes to `ILogsSink.record`. It
 * is a structurally-equivalent subset of the `logs` plugin's
 * `ILogEvent`; we keep it local to the core to avoid a
 * cross-package type dependency (the `logs` plugin normalises its
 * own `ILogEvent` from this shape at the sink boundary).
 */
export interface ISinkEvent {
	readonly ts: string;
	readonly kind: string;
	readonly outcome:
		| 'ok'
		| 'failed'
		| 'timed-out'
		| 'cancelled'
		| 'dead'
		| 'idle'
		| 'unknown';
	readonly severity:
		| 'debug'
		| 'info'
		| 'notice'
		| 'warning'
		| 'error'
		| 'critical'
		| 'alert'
		| 'emergency';
	readonly incidentType: string | null;
	readonly toolName: string | null;
	readonly taskId: string | null;
	readonly agent: string | null;
	readonly summary: string;
	readonly meta: Readonly<Record<string, unknown>>;
}

/**
 * f00153 S4 — cross-plugin incident helper. Defined on the core
 * contract so other plugins can type-check against it without taking
 * a runtime dependency on `@delendai/logs`. The implementation is
 * injected by the `logs` plugin at register time (it owns the
 * `appendEvent` writer that actually persists the event).
 */
export interface IPluginLogsHelper {
	readonly log: (input: IPluginLogInput) => Promise<void>;
}

export interface IPluginLogInput {
	readonly severity:
		| 'debug'
		| 'info'
		| 'notice'
		| 'warning'
		| 'error'
		| 'critical'
		| 'alert'
		| 'emergency';
	readonly incidentType: string;
	readonly message: string;
	readonly files?: readonly string[] | undefined;
	readonly agent?: string | undefined;
	readonly context?: Readonly<Record<string, unknown>> | undefined;
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
	/** Nested activation surfaces owned by this plugin, for host introspection. */
	readonly activation?: readonly IActivationContribution[];
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
				elapsedMs?: number,
		  ) => Promise<void> | void)
		| undefined;
	readonly onToolStart?:
		| ((toolName: string, args: unknown) => Promise<void> | void)
		| undefined;
	/**
	 * f00111 S1: fired when the client aborts an in-flight tool call.
	 * See `IHostObservability.onToolCancel` for the exact semantics.
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
	readonly onRegisterError?:
		| ((info: IPluginRegisterErrorInfo) => Promise<void> | void)
		| undefined;
	readonly onHookError?:
		| ((info: IPluginHookErrorInfo) => Promise<void> | void)
		| undefined;
	readonly isAgentStuck?:
		| ((
				toolName: string,
				args: unknown,
		  ) => { handoffPath: string; suggestedAction: string } | null)
		| undefined;
	/**
	 * f00156: optional post-handler advisory. Core merges every plugin's
	 * provider (highest severity wins) and may inject the winner onto
	 * the tool result. Domain-agnostic — plugins own codes/actions.
	 */
	readonly getCheckpointAdvisory?:
		| import('../contracts/interfaces/checkpoint-advisory.interface').CheckpointAdvisoryProvider
		| undefined;
	/**
	 * f00156: optional pre-handler hook. When the merged advisory has
	 * `severity: 'block'`, core short-circuits the tool handler.
	 */
	readonly beforeToolCall?:
		| import('../contracts/interfaces/checkpoint-advisory.interface').BeforeToolCallHook
		| undefined;
	/**
	 * f00154 S2 — the sink a plugin wants the core to publish
	 * lifecycle events to. The `logs` plugin sets this so the core
	 * forwards every `onToolStart` / `onToolCall` / `onToolCancel`
	 * event to the `logs` JSONL streams, even when the plugin's own
	 * `onTool*` hooks are absent. Other plugins may set their own
	 * sink (e.g. an external SIEM bridge) — only one wins and the
	 * core picks the first one that registers.
	 */
	readonly logsSink?: ILogsSink | undefined;
	/**
	 * f00251 — the error sinks a plugin wants the core to fan-out to.
	 * Multiple sinks coexist (logs, issues, SIEM). The core aggregates
	 * every plugin's errorSinks and exposes a single IErrorCollector
	 * built from them via IMcpPluginContext.errorCollector.
	 */
	readonly errorSinks?: readonly IErrorSink[] | undefined;
}

/**
 * The contract every delendai plugin implements. A plugin package's
 * entry module must `export default` one of these (or a factory that
 * returns one). Resolved by name via the CLI: `delendai --plugins=foo`
 * loads `@delendai/foo`, a bare npm name, or a local path.
 */
export interface IMcpPlugin {
	/** Stable plugin id; also the default tool namespace and cache dir. */
	readonly name: string;
	readonly version?: string;
	/**
	 * Workspace-relative runtime directories/files from older releases.
	 * The core moves each source into this plugin's `pluginCacheDir` before
	 * `register()` runs. New plugins should use `ctx.pluginCacheDir` directly.
	 */
	readonly legacyCachePaths?: readonly {
		readonly source: string;
		readonly destination?: string;
	}[];
	/** One-line, model-agnostic description of what the plugin adds. */
	readonly describe?: string;
	/**
	 * Other plugin ids (by `name`) this plugin requires to be present in
	 * the same load set. Additive/optional: most plugins have no
	 * dependencies. The loader (`load-plugins.ts`) builds a dependency
	 * graph, registers plugins in topological order, and blocks a plugin
	 * before `register()` if one of its hard dependencies is missing,
	 * failed, or is itself blocked. Cycles abort the batch before any
	 * side effects run. Declaring this is the plugin's job; enforcing it
	 * is the loader's.
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
	 * Machine-readable sample config for this plugin's `options`, meant
	 * for consumers that need a direct object to inspect without the docs
	 * wrapper shape of `configExample`. Existing plugins may omit this and
	 * only declare `configExample`; consumers should treat that legacy path
	 * as the fallback source of truth.
	 */
	readonly example?: Readonly<Record<string, unknown>>;
	/**
	 * Optional example config for the docs site. When present, the
	 * `/plugins/<slug>` page renders a copy-pasteable JSON snippet with
	 * the plugin's typical options pre-filled. Plugins without a
	 * `configExample` simply skip the Configuration section on their
	 * page. See l100 s6 and `IPluginConfigExample`.
	 */
	readonly configExample?: IPluginConfigExample;
	/**
	 * Opts this plugin's `pluginCacheDir` into a sub-namespace instead of
	 * the default `<cacheDir>/<name>`. `.cache/delendai/` mixes two
	 * genuinely different things under one "cache" label: derivable
	 * scratch that is safe to delete and rebuild (bootstrap snapshots,
	 * drift analysis, vendored rule packs, the proposals index) and
	 * accumulated records that are NOT safe to delete — losing them loses
	 * real information (the operational log, the agent's memory store,
	 * accrued spend/usage history). `cacheNamespace: 'results'` is the
	 * declared opt-in for the second kind: the plugin's dir becomes
	 * `<cacheDir>/results/<name>` instead of `<cacheDir>/<name>`, still
	 * under the SAME single ignored cache root (no new `.gitignore` entry,
	 * no config schema change) but visibly separated from true cache.
	 * User-flagged 2026-07-17; see `logs`/`memory`/`usage-tracking` for
	 * the only three plugins that currently declare this.
	 */
	readonly cacheNamespace?: 'results';
	/**
	 * Optional cross-plugin configuration validator. It runs after every
	 * selected plugin has passed its own schema and before any plugin is
	 * registered. Returning issues blocks the whole boot with an actionable
	 * configuration diagnostic; returning an empty list permits registration.
	 */
	readonly validateConfiguration?: (
		input: IPluginConfigurationValidationInput,
	) =>
		| readonly IPluginConfigurationIssue[]
		| Promise<readonly IPluginConfigurationIssue[]>;
	register(
		ctx: IMcpPluginContext,
		signal?: AbortSignal,
	):
		| IMcpPluginRegistrations
		| IPluginRuntime<IMcpPluginRegistrations>
		| Promise<
				| IMcpPluginRegistrations
				| IPluginRuntime<IMcpPluginRegistrations>
		  >;
}

export interface IPluginConfigurationValidationInput {
	readonly pluginName: string;
	readonly pluginOptions: ReadonlyMap<
		string,
		Readonly<Record<string, unknown>>
	>;
	readonly enabledPlugins: readonly string[];
}

export interface IPluginConfigurationIssue {
	readonly code: string;
	readonly message: string;
	readonly keys: readonly string[];
	readonly values?: Readonly<Record<string, unknown>>;
	readonly precedence?: string;
	readonly suggestedConfig?: Readonly<Record<string, unknown>>;
}

/** Identity helper for type-safe plugin authoring and inference. */
export const definePlugin = (plugin: IMcpPlugin): IMcpPlugin => plugin;

// `adaptLegacyPlugin` used to live here, beside `definePlugin`, while its
// working twin `adaptLegacyLifecycle` lived in `lifecycle.ts`. Two adapters
// for one job in two modules is how one of them stayed broken unnoticed:
// this copy called `register(plugin)` instead of `register(ctx)`, so every
// plugin adapted through the PUBLIC entry point received itself as its own
// context — no workspace root, no logger, no options — and an `as never`
// silenced the type error that said so. It now lives next to the twin, in
// `lifecycle.ts`, sharing its dispose helpers.
