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

export interface IManagedLazyToolBinding {
	readonly description?: string | undefined;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly handler: unknown;
}

export interface IManagedLazyRuntime {
	activateTool(registrationId: string): Promise<IManagedLazyToolBinding>;
	snapshot(): {
		readonly loadedPluginIds: readonly string[];
		readonly activatedToolIds: readonly string[];
	};
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
	/** Reconnects plugin-level lifecycle contributions once a module activates. */
	readonly onActivated?: (input: {
		readonly plugin: IMcpPlugin;
		readonly registrations: IMcpPluginRegistrations;
		readonly resolvedSpecifier: string;
	}) => void;
}

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

const registrationPayload = (
	value:
		| IMcpPluginRegistrations
		| {
				readonly registrations: IMcpPluginRegistrations;
		  },
): IMcpPluginRegistrations =>
	'registrations' in value ? value.registrations : value;

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

	const activations = new Map<string, Promise<IActivatedPlugin>>();
	const settledPluginIds = new Set<string>();
	const activatedToolIdsByPlugin = new Map<string, readonly string[]>();
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
			if (
				plugin.optionsSchema &&
				!plugin.optionsSchema.safeParse(context.options).success
			) {
				throw new Error(
					`plugin "${pluginId}" rejected its configured options`,
				);
			}
			const registered = await plugin.register(context);
			const payload = registrationPayload(registered);
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
		})();
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
