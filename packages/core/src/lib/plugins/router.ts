import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ILazyPluginDiscovery } from './discovery';
import type {
	IFailedPluginEntry,
	ILazyPluginLoader,
	ILoadedPluginEntry,
	IPluginManifest,
} from './lazy-loader';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IPluginRuntime } from '../contracts/interfaces/plugin-runtime.interface';
import {
	adaptLegacyLifecycle,
	hasPhasedLifecycle,
	runLifecycle,
	type IPhasedLifecycle,
	type IPluginLifecycleActivation,
} from './lifecycle';
import type {
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';
import {
	createPluginStateMachine,
	type ITransitionReason,
	type PluginState,
} from './states';

export type PluginRouteKind = 'tool' | 'prompt' | 'resource';

export interface IPluginRouteMatch {
	readonly kind: PluginRouteKind;
	readonly key: string;
	readonly pluginId: string;
	readonly manifest: IPluginManifest;
}

export interface IPluginRouteLoadResult {
	readonly route: IPluginRouteMatch;
	readonly entry: ILoadedPluginEntry;
	readonly loadMs: number;
	readonly cacheHit: boolean;
	readonly binding?: {
		readonly description?: string;
		readonly inputSchema?: unknown;
		readonly outputSchema?: unknown;
		readonly handler: unknown;
	};
}

export interface IPluginRouterBootResult {
	readonly mode: 'lazy' | 'eager';
	readonly bootMs: number;
	readonly manifestScanMs: number;
	readonly discoveredPluginCount: number;
	readonly eagerlyLoadedPluginCount: number;
	readonly failures: readonly IFailedPluginEntry[];
}

export interface IPluginRouterStats extends IPluginRouterBootResult {
	readonly routeLookups: number;
	readonly routeLoads: number;
	readonly cacheHits: number;
	readonly lastRouteLoadMs: number;
	readonly totalRouteLoadMs: number;
}

export interface IPluginStateTransitionEvent {
	readonly pluginId: string;
	readonly from: PluginState;
	readonly to: PluginState;
	readonly reason: ITransitionReason;
}

export class PluginRouteStateError extends Error {
	readonly kind = 'plugin-not-active';

	constructor(
		readonly pluginId: string,
		readonly state: PluginState,
		readonly route: IPluginRouteMatch,
	) {
		super(
			`plugin "${pluginId}" is ${state} and cannot serve ${route.kind} "${route.key}"`,
		);
		this.name = 'PluginRouteStateError';
	}
}

export interface ILazyPluginRouter {
	initialize(): Promise<IPluginRouterBootResult>;
	listTools(): Promise<readonly string[]>;
	resolveTool(toolName: string): Promise<IPluginRouteMatch | undefined>;
	resolvePrompt(promptName: string): Promise<IPluginRouteMatch | undefined>;
	resolveResource(
		resourceUri: string,
	): Promise<IPluginRouteMatch | undefined>;
	loadToolOwner(toolName: string): Promise<IPluginRouteLoadResult>;
	loadPromptOwner(promptName: string): Promise<IPluginRouteLoadResult>;
	loadResourceOwner(resourceUri: string): Promise<IPluginRouteLoadResult>;
	isInitialized(): boolean;
	pluginState(pluginId: string): PluginState | undefined;
	transitionPlugin(
		pluginId: string,
		to: PluginState,
		reason: ITransitionReason,
	): PluginState;
	onPluginStateTransition(
		listener: (event: IPluginStateTransitionEvent) => void,
	): () => void;
	stats(): IPluginRouterStats;
	reset(): void;
}

export interface ILazyPluginRouterOptions {
	readonly loader: Pick<ILazyPluginLoader, 'load' | 'warmup' | 'state'>;
	readonly discovery: ILazyPluginDiscovery;
	readonly lazy?: boolean;
	readonly buildContext?: (
		pluginId: string,
		cacheNamespace?: 'results',
	) => IMcpPluginContext;
	readonly signal?: AbortSignal;
}

interface ICapturedToolBinding {
	readonly description?: string;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly handler: unknown;
}

const runtimeToRegistrations = (
	runtime: IMcpPluginRegistrations | IPluginRuntime<IMcpPluginRegistrations>,
): IMcpPluginRegistrations =>
	'registrations' in runtime ? runtime.registrations : runtime;

const captureToolRegistrations = async (
	registrations: readonly IToolRegistration[],
): Promise<ReadonlyMap<string, ICapturedToolBinding>> => {
	const captured = new Map<string, ICapturedToolBinding>();
	const captureServer = {
		registerTool(
			name: string,
			config: {
				readonly description?: string;
				readonly inputSchema?: unknown;
				readonly outputSchema?: unknown;
			},
			handler: unknown,
		) {
			captured.set(name, {
				handler,
				...(config.description !== undefined
					? { description: config.description }
					: {}),
				...(config.inputSchema !== undefined
					? { inputSchema: config.inputSchema }
					: {}),
				...(config.outputSchema !== undefined
					? { outputSchema: config.outputSchema }
					: {}),
			});
			return {
				enabled: false,
				enable() {},
				disable() {},
				handler,
			};
		},
	};
	for (const registration of registrations) {
		await registration.register(captureServer as unknown as McpServer);
	}
	return captured;
};

interface IRouteCache {
	readonly toolOwners: ReadonlyMap<string, IPluginRouteMatch>;
	readonly promptOwners: ReadonlyMap<string, IPluginRouteMatch>;
	readonly resourceOwners: ReadonlyMap<string, IPluginRouteMatch>;
	readonly pluginIds: readonly string[];
	readonly boot: IPluginRouterBootResult;
}

const buildRouteMaps = (manifests: readonly IPluginManifest[]): IRouteCache => {
	const toolOwners = new Map<string, IPluginRouteMatch>();
	const promptOwners = new Map<string, IPluginRouteMatch>();
	const resourceOwners = new Map<string, IPluginRouteMatch>();
	for (const manifest of manifests) {
		for (const toolName of manifest.toolNames) {
			if (!toolOwners.has(toolName)) {
				toolOwners.set(toolName, {
					kind: 'tool',
					key: toolName,
					pluginId: manifest.id,
					manifest,
				});
			}
		}
		for (const promptName of manifest.promptNames) {
			if (!promptOwners.has(promptName)) {
				promptOwners.set(promptName, {
					kind: 'prompt',
					key: promptName,
					pluginId: manifest.id,
					manifest,
				});
			}
		}
		for (const resourceUri of manifest.resourceUris) {
			if (!resourceOwners.has(resourceUri)) {
				resourceOwners.set(resourceUri, {
					kind: 'resource',
					key: resourceUri,
					pluginId: manifest.id,
					manifest,
				});
			}
		}
	}
	return {
		toolOwners,
		promptOwners,
		resourceOwners,
		pluginIds: manifests.map((manifest) => manifest.id),
		boot: {
			mode: 'lazy',
			bootMs: 0,
			manifestScanMs: 0,
			discoveredPluginCount: manifests.length,
			eagerlyLoadedPluginCount: 0,
			failures: [],
		},
	};
};

const missingRouteError = (kind: PluginRouteKind, key: string): Error =>
	new Error(`no ${kind} owner found for "${key}"`);

const buildLifecycleContexts = (
	pluginId: string,
	manifest: IPluginManifest,
	pluginContext: IMcpPluginContext,
) => {
	const prepareContext = {
		name: pluginId,
		manifest,
		configResolved: { ...pluginContext.options },
		logger: console,
	};
	return {
		prepareContext,
		activateContext: {
			...prepareContext,
			capabilities: {},
		},
	};
};

export const createLazyPluginRouter = (
	options: ILazyPluginRouterOptions,
): ILazyPluginRouter => {
	const mode = options.lazy === false ? 'eager' : 'lazy';
	let cache: IRouteCache | undefined;
	let initializePromise: Promise<IRouteCache> | undefined;
	let routeLookups = 0;
	let routeLoads = 0;
	let cacheHits = 0;
	let lastRouteLoadMs = 0;
	let totalRouteLoadMs = 0;
	const activationCache = new Map<
		string,
		Promise<ReadonlyMap<string, ICapturedToolBinding>>
	>();
	const pluginStates = new Map<
		string,
		ReturnType<typeof createPluginStateMachine>
	>();
	const transitionListeners = new Set<
		(event: IPluginStateTransitionEvent) => void
	>();

	const bindStateMachine = (
		pluginId: string,
		initial: PluginState = 'ACTIVE',
	) => {
		const existing = pluginStates.get(pluginId);
		if (existing !== undefined) return existing;
		const machine = createPluginStateMachine(initial);
		machine.onTransition((event) => {
			for (const listener of transitionListeners) {
				listener({ pluginId, ...event });
			}
		});
		pluginStates.set(pluginId, machine);
		return machine;
	};

	const stateOf = (pluginId: string): PluginState | undefined =>
		pluginStates.get(pluginId)?.current;

	const ensureInitialized = async (): Promise<IRouteCache> => {
		if (cache !== undefined) return cache;
		if (initializePromise !== undefined) return initializePromise;
		initializePromise = (async (): Promise<IRouteCache> => {
			const startedAt = Date.now();
			const manifests = await options.discovery.manifests();
			const manifestScanMs = options.discovery.stats().lastScanMs;
			const routeCache = buildRouteMaps(manifests);
			const knownPluginIds = new Set(routeCache.pluginIds);
			for (const pluginId of pluginStates.keys()) {
				if (!knownPluginIds.has(pluginId))
					pluginStates.delete(pluginId);
			}
			for (const pluginId of routeCache.pluginIds) {
				bindStateMachine(pluginId, 'ACTIVE');
			}
			let failures: readonly IFailedPluginEntry[] = [];
			let eagerlyLoadedPluginCount = 0;
			if (mode === 'eager') {
				failures = await options.loader.warmup(
					manifests.map((manifest) => manifest.id),
				);
				eagerlyLoadedPluginCount = manifests.length - failures.length;
			}
			cache = {
				...routeCache,
				boot: {
					mode,
					bootMs: Date.now() - startedAt,
					manifestScanMs,
					discoveredPluginCount: manifests.length,
					eagerlyLoadedPluginCount,
					failures,
				},
			};
			return cache;
		})().finally(() => {
			initializePromise = undefined;
		});
		return initializePromise;
	};

	const resolveRoute = async (
		kind: PluginRouteKind,
		key: string,
	): Promise<IPluginRouteMatch | undefined> => {
		routeLookups += 1;
		const initialized = await ensureInitialized();
		const route =
			kind === 'tool'
				? initialized.toolOwners.get(key)
				: kind === 'prompt'
					? initialized.promptOwners.get(key)
					: initialized.resourceOwners.get(key);
		if (route === undefined) return undefined;
		return stateOf(route.pluginId) === 'ACTIVE' ? route : undefined;
	};

	const resolveKnownRoute = async (
		kind: PluginRouteKind,
		key: string,
	): Promise<IPluginRouteMatch | undefined> => {
		const initialized = await ensureInitialized();
		if (kind === 'tool') return initialized.toolOwners.get(key);
		if (kind === 'prompt') return initialized.promptOwners.get(key);
		return initialized.resourceOwners.get(key);
	};

	const assertRouteIsActive = (route: IPluginRouteMatch): void => {
		const state = stateOf(route.pluginId);
		if (state !== 'ACTIVE') {
			throw new PluginRouteStateError(
				route.pluginId,
				state ?? 'UNLOADED',
				route,
			);
		}
	};

	const activateToolBindings = async (
		entry: ILoadedPluginEntry,
	): Promise<ReadonlyMap<string, ICapturedToolBinding>> => {
		const existing = activationCache.get(entry.id);
		if (existing !== undefined) return existing;
		const activation = (async () => {
			const pluginContext =
				options.buildContext?.(entry.id, entry.plugin.cacheNamespace) ??
				({ options: {} } as IMcpPluginContext);
			const lifecycle = (
				hasPhasedLifecycle(entry.plugin)
					? entry.plugin
					: adaptLegacyLifecycle(
							entry.plugin,
							pluginContext,
							options.signal,
						)
			) as IPhasedLifecycle<unknown, IPluginLifecycleActivation>;
			const { prepareContext, activateContext } = buildLifecycleContexts(
				entry.id,
				entry.manifest,
				pluginContext,
			);
			const runtime = await runLifecycle(
				lifecycle,
				prepareContext,
				activateContext as never,
			);
			const registrations = runtimeToRegistrations(runtime);
			return captureToolRegistrations(registrations.tools ?? []);
		})().catch((error) => {
			activationCache.delete(entry.id);
			throw error;
		});
		activationCache.set(entry.id, activation);
		return activation;
	};

	const loadRouteOwner = async (
		kind: PluginRouteKind,
		key: string,
	): Promise<IPluginRouteLoadResult> => {
		const route = await resolveKnownRoute(kind, key);
		if (route === undefined) throw missingRouteError(kind, key);
		assertRouteIsActive(route);
		const cacheHit = options.loader.state(route.pluginId) === 'loaded';
		const startedAt = Date.now();
		const entry = await options.loader.load(route.pluginId);
		const loadMs = Date.now() - startedAt;
		const binding =
			kind === 'tool'
				? (await activateToolBindings(entry)).get(key)
				: undefined;
		if (cacheHit) cacheHits += 1;
		routeLoads += 1;
		lastRouteLoadMs = loadMs;
		totalRouteLoadMs += loadMs;
		return {
			route,
			entry,
			loadMs,
			cacheHit,
			...(binding === undefined ? {} : { binding }),
		};
	};

	return {
		async initialize() {
			return (await ensureInitialized()).boot;
		},
		async listTools() {
			const initialized = await ensureInitialized();
			return [...initialized.toolOwners.values()]
				.filter((route) => stateOf(route.pluginId) === 'ACTIVE')
				.map((route) => route.key)
				.sort();
		},
		resolveTool(toolName) {
			return resolveRoute('tool', toolName);
		},
		resolvePrompt(promptName) {
			return resolveRoute('prompt', promptName);
		},
		resolveResource(resourceUri) {
			return resolveRoute('resource', resourceUri);
		},
		loadToolOwner(toolName) {
			return loadRouteOwner('tool', toolName);
		},
		loadPromptOwner(promptName) {
			return loadRouteOwner('prompt', promptName);
		},
		loadResourceOwner(resourceUri) {
			return loadRouteOwner('resource', resourceUri);
		},
		isInitialized() {
			return cache !== undefined;
		},
		pluginState(pluginId) {
			return stateOf(pluginId);
		},
		transitionPlugin(pluginId, to, reason) {
			if (cache === undefined) {
				throw new Error(
					`plugin router must be initialized before transitioning "${pluginId}"`,
				);
			}
			if (cache !== undefined && !cache.pluginIds.includes(pluginId)) {
				throw new Error(`unknown plugin "${pluginId}"`);
			}
			bindStateMachine(pluginId, 'UNLOADED').transition(to, reason);
			return stateOf(pluginId) ?? to;
		},
		onPluginStateTransition(listener) {
			transitionListeners.add(listener);
			return () => {
				transitionListeners.delete(listener);
			};
		},
		stats() {
			return {
				mode,
				bootMs: cache?.boot.bootMs ?? 0,
				manifestScanMs: cache?.boot.manifestScanMs ?? 0,
				discoveredPluginCount: cache?.boot.discoveredPluginCount ?? 0,
				eagerlyLoadedPluginCount:
					cache?.boot.eagerlyLoadedPluginCount ?? 0,
				failures: cache?.boot.failures ?? [],
				routeLookups,
				routeLoads,
				cacheHits,
				lastRouteLoadMs,
				totalRouteLoadMs,
			};
		},
		reset() {
			cache = undefined;
			initializePromise = undefined;
			routeLookups = 0;
			routeLoads = 0;
			cacheHits = 0;
			lastRouteLoadMs = 0;
			totalRouteLoadMs = 0;
			activationCache.clear();
			pluginStates.clear();
			transitionListeners.clear();
			options.discovery.invalidate();
		},
	};
};
