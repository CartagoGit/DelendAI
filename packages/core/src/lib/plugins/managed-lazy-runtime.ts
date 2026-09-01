/**
 * Runtime for the managed plugin path.
 *
 * A managed boot knows the compact plugin/tool index, but does not import a
 * plugin entry module. The first routed call imports exactly one package,
 * invokes its normal `register(ctx)` contract against a tiny capture server,
 * and keeps only the selected tool handler/schema in memory. This preserves
 * the existing plugin API while moving activation to first use.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from './plugin-contract';
import type { IManagedLazyPluginCatalogEntry } from './managed-lazy-catalog.generated';
import type { IManagedLazyDisposeAggregateError } from '../contracts/interfaces/plugin-activation-session.interface';
import { activatePluginSession } from './plugin-activation-session';
import { normalizePluginOptions } from './plugin-activation-session';
import { extractPartialRuntime } from './load-plugins-runtime.helper';
import { validatePluginConfiguration } from './configuration-compatibility';

export interface IManagedLazyToolBinding {
	readonly description?: string | undefined;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly handler: unknown;
}

export interface IManagedLazyRuntime {
	activatePlugin(pluginId: string): Promise<void>;
	activateTool(registrationId: string): Promise<IManagedLazyToolBinding>;
	snapshot(): {
		readonly loadedPluginIds: readonly string[];
		readonly activatedToolIds: readonly string[];
	};
	/**
	 * Dispose one plugin's retained `dispose`, if it registered one and
	 * has not already been disposed. Idempotent, and shares its
	 * bookkeeping with `disposeAll` — a plugin evicted mid-session
	 * (x00286 S4) is never disposed a second time at final process
	 * shutdown. A plugin that never activated, or whose `register()`
	 * returned no `dispose`, is a silent no-op: there is nothing to
	 * free. Errors propagate uncaught; the one production caller
	 * (`ToolSurfaceRuntime`'s injected `pluginDisposer`, wired through
	 * `setPluginDisposer`) already catches and aggregates per-plugin
	 * failures without blocking the relazy.
	 */
	disposePlugin(pluginId: string): Promise<void>;
	/**
	 * Dispose every plugin runtime activated so far, in reverse
	 * activation order (AUD-E02 / r00039). Idempotent: a plugin whose
	 * `dispose` already ran (or that never retained one) is skipped.
	 * One plugin's `dispose` throwing does not stop the others — every
	 * failure is collected and returned instead of thrown, so a single
	 * bad plugin can never mask the rest of the teardown.
	 */
	disposeAll(): Promise<readonly IManagedLazyDisposeAggregateError[]>;
}

export interface IManagedLazyRuntimeOptions {
	readonly namespacePrefix: string;
	readonly plugins: readonly IManagedLazyPluginCatalogEntry[];
	readonly namespaces: ReadonlyMap<string, string>;
	readonly buildContext: (
		pluginName: string,
		cacheNamespace?: 'results',
	) => IMcpPluginContext;
	readonly importFn: (specifier: string) => Promise<unknown>;
	/**
	 * Per-activation register() timeout (ms), applied through the same
	 * `PluginActivationSession` the eager loader uses. Defaults to the
	 * eager loader's own default (15000) so a plugin behaves identically
	 * however it was activated (AUD-E01.b).
	 */
	readonly registerTimeoutMs?: number | undefined;
	/** External cancellation, propagated to every activation's register(). */
	readonly signal?: AbortSignal | undefined;
	/** Reconnects plugin-level lifecycle contributions once a module activates. */
	readonly onActivated?: (input: {
		readonly plugin: IMcpPlugin;
		readonly registrations: IMcpPluginRegistrations;
		readonly resolvedSpecifier: string;
	}) => void;
	/** Records an activation failure without stopping unrelated plugins. */
	readonly onActivationError?: (input: {
		readonly pluginId: string;
		readonly resolvedSpecifier: string;
		readonly error: unknown;
	}) => void;
}

export const validateManagedLazyConfiguration = async (options: {
	readonly plugins: readonly IManagedLazyPluginCatalogEntry[];
	readonly buildContext: (
		pluginName: string,
		cacheNamespace?: 'results',
	) => IMcpPluginContext;
	readonly pluginOptions: ReadonlyMap<
		string,
		Readonly<Record<string, unknown>>
	>;
	readonly enabledPlugins: readonly string[];
	readonly importFn: (specifier: string) => Promise<unknown>;
}): Promise<readonly string[]> => {
	const loadedPlugins: IMcpPlugin[] = [];
	const normalizedOptions = new Map<
		string,
		Readonly<Record<string, unknown>>
	>();
	for (const definition of options.plugins) {
		const module = await options.importFn(definition.packageSpecifier);
		const plugin = pluginFromModule(module);
		if (plugin === undefined) continue;
		const normalized = normalizePluginOptions(
			plugin,
			options.buildContext(plugin.name, plugin.cacheNamespace),
		);
		if (!normalized.ok) throw new Error(normalized.message);
		loadedPlugins.push(plugin);
		normalizedOptions.set(plugin.name, normalized.ctx.options);
	}
	return validatePluginConfiguration({
		plugins: loadedPlugins,
		pluginOptions: normalizedOptions,
		enabledPlugins: options.enabledPlugins,
	});
};

interface ICapturedTool {
	readonly name: string;
	readonly config: {
		readonly description?: string;
		readonly inputSchema?: unknown;
		readonly outputSchema?: unknown;
	};
	readonly handler: unknown;
}

interface IActivatedPlugin {
	readonly tools: ReadonlyMap<string, IManagedLazyToolBinding>;
}

const pluginFromModule = (module: unknown): IMcpPlugin | undefined => {
	const candidate =
		module && typeof module === 'object' && 'default' in module
			? (module as { readonly default: unknown }).default
			: module;
	const value =
		typeof candidate === 'function'
			? (candidate as () => unknown)()
			: candidate;
	return value &&
		typeof value === 'object' &&
		'name' in value &&
		'register' in value
		? (value as IMcpPlugin)
		: undefined;
};

const captureToolRegistrations = async (
	registrations: readonly IToolRegistration[],
): Promise<ReadonlyMap<string, ICapturedTool>> => {
	const captured = new Map<string, ICapturedTool>();
	const captureServer = {
		registerTool(
			name: string,
			config: ICapturedTool['config'],
			handler: unknown,
		) {
			captured.set(name, { name, config, handler });
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

export const createManagedLazyRuntime = (
	options: IManagedLazyRuntimeOptions,
): IManagedLazyRuntime => {
	const definitionsById = new Map(
		options.plugins.map((entry) => [entry.id, entry] as const),
	);
	const ownerByRegistrationId = new Map<
		string,
		{ pluginId: string; toolId: string }
	>();
	for (const plugin of options.plugins) {
		const namespace = options.namespaces.get(plugin.id) ?? plugin.id;
		for (const toolId of plugin.toolIds) {
			ownerByRegistrationId.set(
				`${options.namespacePrefix}_${namespace}_${toolId}`,
				{ pluginId: plugin.id, toolId },
			);
		}
	}

	const registerTimeoutMs = options.registerTimeoutMs ?? 15_000;
	const activations = new Map<string, Promise<IActivatedPlugin>>();
	const settledPluginIds = new Set<string>();
	const activatedToolIdsByPlugin = new Map<string, readonly string[]>();
	// Retained per-plugin `dispose`, in activation order, so `disposeAll`
	// can tear the working set down in reverse — the lazy-route half of
	// AUD-E01.c / AUD-E02: before this the `dispose` a plugin returned
	// was captured nowhere and could never be called.
	const disposersInActivationOrder: Array<{
		readonly pluginId: string;
		readonly dispose: () => Promise<void> | void;
	}> = [];
	const disposedPluginIds = new Set<string>();
	const activatePlugin = (
		pluginId: string,
		activationStack: readonly string[] = [],
	): Promise<IActivatedPlugin> => {
		const existing = activations.get(pluginId);
		if (existing !== undefined) return existing;
		if (activationStack.includes(pluginId)) {
			throw new Error(
				`managed lazy plugin dependency cycle: ${[...activationStack, pluginId].join(' -> ')}`,
			);
		}
		const promise = (async (): Promise<IActivatedPlugin> => {
			const definition = definitionsById.get(pluginId);
			if (definition === undefined)
				throw new Error(
					`managed lazy plugin is not indexed: ${pluginId}`,
				);
			const module = await options.importFn(definition.packageSpecifier);
			const plugin = pluginFromModule(module);
			if (plugin === undefined)
				throw new Error(
					`managed lazy package ${definition.packageSpecifier} did not export a plugin`,
				);
			for (const dependency of plugin.dependsOn ?? []) {
				if (!definitionsById.has(dependency)) {
					throw new Error(
						`managed lazy plugin "${pluginId}" requires unloaded dependency "${dependency}"`,
					);
				}
				await activatePlugin(dependency, [
					...activationStack,
					pluginId,
				]);
			}
			const context = options.buildContext(
				pluginId,
				plugin.cacheNamespace,
			);
			const configurationIssues = await validatePluginConfiguration({
				plugins: [plugin],
				pluginOptions:
					context.pluginOptions ??
					new Map([[pluginId, context.options]]),
				enabledPlugins: options.plugins.map((entry) => entry.id),
			});
			if (configurationIssues.length > 0) {
				throw new Error(configurationIssues.join('\n\n'));
			}
			// Goes through the SAME `PluginActivationSession` primitive the
			// eager loader uses: options are parsed via `parsed.data` (not
			// discarded, AUD-E01.a), `register()` runs under
			// `registerTimeoutMs` + `options.signal` (AUD-E01.b), and the
			// returned runtime is normalized so its `dispose` — if any — is
			// never lost (AUD-E01.c).
			let runtime: Awaited<ReturnType<typeof activatePluginSession>>;
			try {
				runtime = await activatePluginSession({
					plugin,
					ctx: context,
					timeoutMs: registerTimeoutMs,
					signal: options.signal,
				});
			} catch (error) {
				// A plugin whose register() fails mid-way may still have
				// returned a partial runtime (attached via `error.runtime` /
				// `error.registrations`, the same convention the eager
				// rollback path uses). Dispose it so a failed activation
				// leaves no residue — best-effort: a broken dispose here must
				// not mask the original registration error.
				const partial = extractPartialRuntime(error);
				if (partial?.dispose !== undefined) {
					await Promise.resolve(partial.dispose()).catch(
						() => undefined,
					);
				}
				throw error;
			}
			if (runtime.dispose !== undefined) {
				disposersInActivationOrder.push({
					pluginId,
					dispose: runtime.dispose,
				});
			}
			const payload = runtime.registrations;
			options.onActivated?.({
				plugin,
				registrations: payload,
				resolvedSpecifier: definition.packageSpecifier,
			});
			const captured = await captureToolRegistrations(
				payload.tools ?? [],
			);
			const namespace = options.namespaces.get(pluginId) ?? pluginId;
			const tools = new Map<string, IManagedLazyToolBinding>();
			for (const toolId of definition.toolIds) {
				const name = `${options.namespacePrefix}_${namespace}_${toolId}`;
				const capturedTool = captured.get(name);
				if (capturedTool === undefined) continue;
				tools.set(toolId, {
					...(capturedTool.config.description !== undefined
						? { description: capturedTool.config.description }
						: {}),
					...(capturedTool.config.inputSchema !== undefined
						? { inputSchema: capturedTool.config.inputSchema }
						: {}),
					...(capturedTool.config.outputSchema !== undefined
						? { outputSchema: capturedTool.config.outputSchema }
						: {}),
					handler: capturedTool.handler,
				});
			}
			return { tools };
		})().catch((error: unknown) => {
			const definition = definitionsById.get(pluginId);
			if (definition !== undefined) {
				options.onActivationError?.({
					pluginId,
					resolvedSpecifier: definition.packageSpecifier,
					error,
				});
			}
			throw error;
		});
		activations.set(pluginId, promise);
		void promise.then(
			(value) => {
				settledPluginIds.add(pluginId);
				activatedToolIdsByPlugin.set(pluginId, [...value.tools.keys()]);
			},
			() => undefined,
		);
		return promise;
	};

	return {
		async activatePlugin(pluginId) {
			await activatePlugin(pluginId);
		},
		async activateTool(registrationId) {
			const owner = ownerByRegistrationId.get(registrationId);
			if (owner === undefined)
				throw new Error(
					`managed lazy tool is not indexed: ${registrationId}`,
				);
			const activated = await activatePlugin(owner.pluginId);
			const binding = activated.tools.get(owner.toolId);
			if (binding === undefined) {
				throw new Error(
					`plugin "${owner.pluginId}" did not register "${owner.toolId}"`,
				);
			}
			return binding;
		},
		async disposePlugin(pluginId) {
			if (disposedPluginIds.has(pluginId)) return;
			const entry = disposersInActivationOrder.find(
				(candidate) => candidate.pluginId === pluginId,
			);
			if (entry === undefined) return;
			// Mark disposed before awaiting so a concurrent call (or a later
			// `disposeAll` at process shutdown) can never race this plugin's
			// `dispose` a second time.
			disposedPluginIds.add(pluginId);
			await entry.dispose();
		},
		async disposeAll() {
			const errors: IManagedLazyDisposeAggregateError[] = [];
			// Reverse activation order mirrors the eager loader's teardown
			// (`disposeLoadedPlugins`): a plugin is disposed before the
			// dependency it activated on the way up.
			for (const entry of [...disposersInActivationOrder].reverse()) {
				if (disposedPluginIds.has(entry.pluginId)) continue;
				disposedPluginIds.add(entry.pluginId);
				try {
					await entry.dispose();
				} catch (error) {
					errors.push({ pluginId: entry.pluginId, error });
				}
			}
			return errors;
		},
		snapshot() {
			const loadedPluginIds = [...settledPluginIds];
			const activatedToolIds = [...activatedToolIdsByPlugin].flatMap(
				([pluginId, toolIds]) =>
					toolIds.map((toolId) => `${pluginId}:${toolId}`),
			);
			return {
				loadedPluginIds: loadedPluginIds.sort(),
				activatedToolIds: activatedToolIds.sort(),
			};
		},
	};
};
