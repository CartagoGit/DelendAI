import type { IKnowledgeEntry } from './knowledge.interface';
import type { IMcpToolSurfaceMode } from './surface-mode.interface';

/**
 * A tool's access to the live MCP surface, modelled as one state instead
 * of two independent booleans (visibility + authorization) so the illegal
 * combination — deactivated yet still executable — cannot be represented:
 *
 *   - `visible`     — listed in tools/list AND callable through the router.
 *   - `hidden`       — not listed (compact/adaptive/native surface modes
 *                      hide it), but still callable through the router.
 *                      This is a legitimate, desirable state.
 *   - `deactivated` — not listed AND refused by the router. Only
 *                      `plugin_deactivate` produces this state; nothing
 *                      else may re-introduce visibility for a deactivated
 *                      tool without first reactivating it.
 */
export type IToolAccessState = 'visible' | 'hidden' | 'deactivated';

export type IToolExposureState = 'visible' | 'hidden' | 'unknown';

export interface ISurfaceListChangeBatcher {
	batch<T>(work: () => Promise<T>): Promise<T>;
	batchSync<T>(work: () => T): T;
}

export interface IToolSurfaceDescriptor {
	readonly registrationId: string;
	readonly name: string;
	readonly toolId: string;
	readonly pluginId?: string | undefined;
	readonly namespace?: string | undefined;
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
}

export interface IToolSurfacePluginDescriptor {
	readonly id: string;
	readonly namespace: string;
	readonly describe?: string | undefined;
	readonly toolRegistrationIds: readonly string[];
}

export interface IToolSurfaceWorkingSetPolicy {
	/** Idle time after the last routed use before a plugin leaves the warm set. */
	readonly idleTtlMs: number | null;
	/** Maximum number of non-core plugins kept warm; null means unlimited. */
	readonly maxWarmPlugins: number | null;
}

export interface IToolSurfacePlan {
	readonly mode: IMcpToolSurfaceMode;
	readonly explicitMode?: IMcpToolSurfaceMode | undefined;
	readonly bootstrapToolIds: readonly string[];
	readonly routerToolId?: string | undefined;
	readonly workingSet?: IToolSurfaceWorkingSetPolicy | undefined;
	readonly descriptors: readonly IToolSurfaceDescriptor[];
	readonly plugins: readonly IToolSurfacePluginDescriptor[];
	readonly activationKpis?: {
		recordInvocation(toolId: string): void;
	};
}

export interface IToolSurfaceModeChange {
	readonly previousMode: IMcpToolSurfaceMode;
	readonly mode: IMcpToolSurfaceMode;
	readonly changedToolNames: readonly string[];
	readonly visibleToolNames: readonly string[];
}

export interface IToolSurfaceSearchEntry extends IToolSurfaceDescriptor {
	readonly active: boolean;
	readonly detailsId: string;
}

export interface IToolSurfaceLazyBinding {
	readonly description?: string | undefined;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly handler: unknown;
}

export interface IPluginSurfaceChange {
	readonly pluginId: string;
	readonly namespace: string;
	readonly active: boolean;
	readonly changedToolNames: readonly string[];
	readonly visibleToolNames: readonly string[];
	readonly note?: string | undefined;
}

/**
 * Fired once per plugin actually removed from the warm working set
 * (AUD-C02 / x00286), after its `dispose` — if a disposer is wired via
 * `IToolSurfaceRuntime.setPluginDisposer` — has settled. `disposeError`
 * is present only when that dispose threw; the plugin is relazied
 * either way, because a broken dispose must never block the tools from
 * becoming reactivatable again. This is the observability the audit
 * asked for: `evictIdlePlugins` used to change state with no signal
 * anyone could see.
 */
export interface IToolSurfacePluginEvictedEvent {
	readonly pluginId: string;
	readonly namespace: string;
	readonly reason: 'idle-ttl' | 'max-warm-plugins';
	readonly disposeError?: unknown;
}

export interface IProjectContextSnapshot {
	readonly surfaceMode: IMcpToolSurfaceMode;
	readonly workspaceRoot: string;
	readonly cacheDir?: string | undefined;
	readonly docsDir?: string | undefined;
	readonly configIssues: readonly string[];
	readonly loadedPlugins: readonly string[];
	readonly warmPlugins?: readonly string[];
	readonly visibleToolCount: number;
	readonly hiddenToolCount: number;
	readonly visibleDomains: readonly string[];
}

export interface IToolSurfaceRuntime {
	readonly mode: IMcpToolSurfaceMode;
	bindRegisteredTool(input: {
		readonly registrationId: string;
		readonly name: string;
		readonly description?: string | undefined;
		readonly inputSchema?: unknown;
		readonly outputSchema?: unknown;
		readonly handler: unknown;
		readonly handle: {
			enabled: boolean;
			enable(): void;
			disable(): void;
		};
	}): void;
	bindLazyTool(input: {
		readonly registrationId: string;
		readonly activate: () => Promise<IToolSurfaceLazyBinding>;
	}): void;
	finalizeInitialSurface(): void;
	applySurfaceMode(mode: IMcpToolSurfaceMode): IToolSurfaceModeChange;
	/**
	 * Async counterpart to `applySurfaceMode` for the one transition a
	 * pure bookkeeping flip cannot fulfil: switching TO `native` must put
	 * every configured plugin's tools on the wire as real `tools/list`
	 * entries immediately (AUD-C01) — a tool still behind `lazyActivate`
	 * has no live SDK `RegisteredTool` for `applySurfaceMode`'s
	 * `handle.enable()` to affect, so flipping `access` alone leaves it
	 * invisible to the client. This materializes every plugin that has
	 * not loaded yet (via the `setLazyPluginLoader` callback) before
	 * delegating to the synchronous `applySurfaceMode` when
	 * `mode === 'native'`; for any other mode it is exactly equivalent to
	 * `applySurfaceMode` — no plugin is force-loaded, which is what keeps
	 * managed/adaptive/compact's token budget intact.
	 */
	applySurfaceModeAsync(
		mode: IMcpToolSurfaceMode,
	): Promise<IToolSurfaceModeChange>;
	publicDescriptionFor(
		registrationId: string,
		original: string | undefined,
		fallbackSummary: string | undefined,
	): string | undefined;
	getToolExposure(name: string): IToolExposureState;
	/** @deprecated Prefer `getToolExposure` so unknown names stay distinguishable. */
	isToolExposed(name: string): boolean;
	listToolKnowledgeEntries(): ReadonlyArray<
		Pick<IKnowledgeEntry, 'id' | 'title'>
	>;
	getToolKnowledgeEntry(id: string): IKnowledgeEntry | undefined;
	searchTools(input?: {
		readonly query?: string | undefined;
		readonly activeOnly?: boolean | undefined;
		readonly plugin?: string | undefined;
		readonly tag?: string | undefined;
		readonly limit?: number | undefined;
	}): readonly IToolSurfaceSearchEntry[];
	/** Measure the registered MCP tool definitions for a surface mode. */
	measureSchemaBytes(
		mode: IMcpToolSurfaceMode,
	): Readonly<Record<string, number>>;
	activatePlugin(identifier: string): IPluginSurfaceChange | null;
	readonly activatePluginAsync?:
		| ((identifier: string) => Promise<IPluginSurfaceChange | null>)
		| undefined;
	readonly setLazyPluginLoader?:
		| ((loader: (pluginId: string) => Promise<void>) => void)
		| undefined;
	readonly setListChangeBatcher?:
		| ((batcher: ISurfaceListChangeBatcher) => void)
		| undefined;
	deactivatePlugin(identifier: string): IPluginSurfaceChange | null;
	/**
	 * Inject the callback that actually tears down a plugin's live
	 * resources (timers, connections, memory) when it is evicted from
	 * the warm working set. Optional and analogous to
	 * `setLazyPluginLoader` for the opposite direction (warm -> cold):
	 * without one wired, eviction still does the honest half of the
	 * work (hides the real handler behind `lazyActivate` again, stops
	 * counting the plugin as loaded) but never claims to have freed
	 * resources it cannot name (AUD-C02 / x00286).
	 */
	readonly setPluginDisposer?:
		| ((disposer: (pluginId: string) => Promise<void>) => void)
		| undefined;
	/**
	 * Subscribe to real plugin evictions (AUD-C02 / x00286). Returns an
	 * unsubscribe function.
	 */
	readonly onPluginEvicted?:
		| ((
				listener: (event: IToolSurfacePluginEvictedEvent) => void,
		  ) => () => void)
		| undefined;
	/** Evict idle/least-recently-used plugin working-set entries. */
	evictIdlePlugins(nowMs?: number): readonly string[];
	/**
	 * True while at least one lazily-activated plugin has an
	 * `invokeTool` call in flight. `McpHostSession.dispose()` polls this
	 * before disposing plugin runtimes so a live invocation is never cut
	 * out from under its own plugin (AUD-E02).
	 */
	hasInFlightWork(): boolean;
	getProjectContext(input: {
		readonly workspaceRoot: string;
		readonly cacheDir?: string | undefined;
		readonly docsDir?: string | undefined;
		readonly configIssues?: readonly string[] | undefined;
	}): IProjectContextSnapshot;
	resolveRoute(
		domain: string,
		action: string,
	): IToolSurfaceSearchEntry | undefined;
	invokeTool(name: string, args: unknown, extra: unknown): Promise<unknown>;
}

export interface IToolSurfaceRuntimeAccess {
	get(): IToolSurfaceRuntime | undefined;
	bind(runtime: IToolSurfaceRuntime): void;
}
