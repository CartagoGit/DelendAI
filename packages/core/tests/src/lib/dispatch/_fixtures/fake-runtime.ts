/**
 * Synthetic runtime fixture for the CapabilityResolver test suite.
 *
 * x00512 / S6. The fixture exists so the resolver's contract can be
 * asserted without referencing any real plugin/tool id. The plugin
 * names `fake_alpha`, `fake_beta`, `fake_gamma` and their tools are
 * invented here — the linter
 * `proposals/lint/no-domain-leak.script.ts` will fail any test that
 * accidentally introduces a hardcoded `proposals` / `create_proposal`
 * reference in this file's transitive calls.
 *
 * The fixture mirrors the public surface of
 * `IToolSurfaceRuntime` / `IToolSurfaceRuntimeAccess` enough that the
 * resolver's queries (`resolveRoute`, `getToolExposure`,
 * `searchTools`, `activatePlugin(Async)`, `invokeTool`) all work.
 */

import type {
	IPluginSurfaceChange,
	IToolSurfaceRuntime,
	IToolSurfaceRuntimeAccess,
	IToolSurfaceSearchEntry,
} from '../../../../../src/lib/contracts/interfaces/tool-surface.interface';

/**
 * Local record shape that mirrors what the public surface runtime
 * exposes. We deliberately do NOT import `IFakeBoundRecord` (it is
 * internal to `tool-surface-runtime.service.ts`); the record shape
 * below is enough for the synthetic fixture.
 */
interface IFakeBoundRecord {
	readonly name: string;
	readonly toolId: string;
	readonly namespace?: string;
	readonly pluginId?: string;
	readonly registrationId: string;
	readonly access: 'hidden' | 'visible' | 'deactivated';
	readonly disclosure: 'essential' | 'contextual' | 'administrative';
	readonly summary?: string;
	readonly tags?: readonly string[];
	readonly detailsId: string;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
	readonly handler: (args: unknown) => Promise<unknown> | unknown;
	readonly lazyActivate?: (() => Promise<unknown>) | undefined;
}

const SYNC_PLUGIN_LOADER_HOLD_MS = 0;

type IFakeDescriptor = {
	readonly name: string;
	readonly toolId: string;
	readonly namespace: string;
	readonly pluginId: string;
	readonly handler: () => Promise<unknown> | unknown;
};

type IFakePlugin = {
	readonly id: string;
	readonly namespace: string;
	readonly descriptors: IFakeDescriptor[];
	loaded: boolean;
	deactivated: boolean;
};

const buildHandler = (
	returns: () => unknown,
	thrown: unknown
): (() => Promise<unknown>) => {
	return async () => {
		if (thrown !== null) throw thrown;
		return returns();
	};
};

export const buildFakeRuntime = (): {
	readonly port: { get(): IToolSurfaceRuntime | undefined; bind(): void };
	readonly extra: unknown;
	readonly access: IToolSurfaceRuntimeAccess;
	activateSync(pluginId: string): void;
	deactivatePlugin(pluginId: string): void;
	makeLoaderThrow(pluginId: string, message: string): void;
	makeHandlerThrow(toolName: string, message: string): void;
	trackLoaderInvocations(): { callCount(pluginId: string): number };
	trackFilesystemWrites(): { count(): number };
	dispose(): void;
} => {
	const pluginsById = new Map<string, IFakePlugin>();
	const pluginLoadCallCounters = new Map<string, number>();
	const handlerThrowersByName = new Map<string, string>();
	const loaderThrowersById = new Map<string, string>();
	let filesystemWriteCount = 0;

	const plugins: IFakePlugin[] = [
		{
			id: 'fake_alpha',
			namespace: 'alpha',
			loaded: false,
			deactivated: false,
			descriptors: [
				{
					name: 'fake_alpha_list',
					toolId: 'list',
					namespace: 'alpha',
					pluginId: 'fake_alpha',
					handler: buildHandler(
						() => ({ entries: ['synthetic-row-a'] }),
						null
					),
				},
				{
					name: 'fake_alpha_save',
					toolId: 'save',
					namespace: 'alpha',
					pluginId: 'fake_alpha',
					handler: buildHandler(() => ({ saved: true }), null),
				},
			],
		},
		{
			id: 'fake_beta',
			namespace: 'beta',
			loaded: false,
			deactivated: false,
			descriptors: [
				{
					name: 'fake_beta_fetch',
					toolId: 'fetch',
					namespace: 'beta',
					pluginId: 'fake_beta',
					handler: buildHandler(() => ({ value: 42 }), null),
				},
			],
		},
		{
			id: 'fake_gamma',
			namespace: 'gamma',
			loaded: false,
			deactivated: false,
			descriptors: [],
		},
	];
	for (const plugin of plugins) pluginsById.set(plugin.id, plugin);

	const recordsByName = new Map<string, IFakeBoundRecord>();
	const buildRecord = (descriptor: IFakeDescriptor): IFakeBoundRecord => ({
		name: descriptor.name,
		toolId: descriptor.toolId,
		namespace: descriptor.namespace,
		pluginId: descriptor.pluginId,
		registrationId: descriptor.name,
		access: 'hidden',
		disclosure: 'essential',
		summary: `Synthetic tool ${descriptor.name}`,
		tags: [],
		detailsId: `tool:${descriptor.name}`,
		inputSchema: undefined,
		outputSchema: undefined,
		handler: descriptor.handler,
		lazyActivate: undefined,
	});
	for (const plugin of plugins)
		for (const descriptor of plugin.descriptors)
			recordsByName.set(descriptor.name, buildRecord(descriptor));

	const setterAccess = (
		access: 'hidden' | 'visible' | 'deactivated'
	): void => {
		for (const plugin of plugins)
			for (const descriptor of plugin.descriptors) {
				const record = recordsByName.get(descriptor.name);
				if (record === undefined) continue;
				// A plugin that was administratively deactivated keeps
				// its records at `deactivated`, even if a lazy
				// activation flips the rest of the catalog to `visible`.
				// (The real runtime does the same via the policy
				// boundary inside `setPluginState`.)
				if (plugin.deactivated && access === 'visible') continue;
				(
					record as { access: 'hidden' | 'visible' | 'deactivated' }
				).access = access;
			}
	};
	const inFlightActivations = new Map<
		string,
		Promise<IPluginSurfaceChange | null>
	>();
	const inFlightLazyLoads = new Map<string, Promise<void>>();

	const runtime: IToolSurfaceRuntime = {
		mode: 'managed',
		bindRegisteredTool: () => undefined,
		bindLazyTool: () => undefined,
		finalizeInitialSurface: () => undefined,
		applySurfaceMode: () => ({
			previousMode: 'managed',
			mode: 'managed',
			changedToolNames: [],
			visibleToolNames: [],
		}),
		applySurfaceModeAsync: async () => ({
			previousMode: 'managed',
			mode: 'managed',
			changedToolNames: [],
			visibleToolNames: [],
		}),
		publicDescriptionFor: () => undefined,
		getToolExposure(name: string) {
			const record = recordsByName.get(name);
			if (record === undefined) return 'unknown' as const;
			return record.access === 'visible'
				? ('visible' as const)
				: ('hidden' as const);
		},
		isToolExposed: (name: string) => recordsByName.has(name),
		listToolKnowledgeEntries: () => [],
		getToolKnowledgeEntry: () => undefined,
		searchTools: (input?: {
			readonly query?: string;
		}): readonly IToolSurfaceSearchEntry[] => {
			const query = (input?.query ?? '').toLowerCase();
			return [...recordsByName.values()]
				.filter((record) => {
					if (query.length === 0) return true;
					return (
						record.name.toLowerCase().includes(query) ||
						record.toolId.toLowerCase().includes(query) ||
						(record.namespace ?? '')
							.toLowerCase()
							.includes(query) ||
						(record.pluginId ?? '').toLowerCase().includes(query)
					);
				})
				.map((record) => ({
					registrationId: record.registrationId,
					name: record.name,
					toolId: record.toolId,
					pluginId: record.pluginId ?? '',
					namespace: record.namespace,
					summary: record.summary,
					tags: record.tags ?? [],
					active: record.access === 'visible',
					detailsId: record.detailsId,
				}));
		},
		measureSchemaBytes: () => ({}),
		activatePlugin(identifier: string): IPluginSurfaceChange | null {
			const plugin =
				pluginsById.get(identifier) ??
				plugins.find((p) => p.namespace === identifier);
			if (plugin === undefined) return null;
			if (plugin.deactivated) return null;
			plugin.loaded = true;
			setterAccess('visible');
			return {
				pluginId: plugin.id,
				namespace: plugin.namespace,
				active: true,
				changedToolNames: plugin.descriptors.map((d) => d.name),
				visibleToolNames: plugin.descriptors.map((d) => d.name),
			};
		},
		async activatePluginAsync(
			identifier: string
		): Promise<IPluginSurfaceChange | null> {
			const plugin =
				pluginsById.get(identifier) ??
				plugins.find((p) => p.namespace === identifier);
			if (plugin === undefined) return null;
			// Mirror the real runtime's contract: an already-loaded
			// plugin returns the same shape immediately, without
			// re-running the loader. Two concurrent callers share a
			// single loader run via `inFlightActivations`. A
			// deactivated plugin is treated the same as a hidden one
			// here — `setPluginState` flips it back to `visible`, just
			// like the real runtime, and `invokeTool` separately
			// rejects `'deactivated'` records with
			// `ToolNotAuthorizedError` (the policy boundary).
			if (plugin.loaded) {
				return {
					pluginId: plugin.id,
					namespace: plugin.namespace,
					active: true,
					changedToolNames: [],
					visibleToolNames: plugin.descriptors.map((d) => d.name),
				} as const;
			}
			const inFlight = inFlightActivations.get(plugin.id);
			if (inFlight !== undefined) return inFlight;
			const tracked: Promise<IPluginSurfaceChange | null> = (async () => {
				pluginLoadCallCounters.set(
					plugin.id,
					(pluginLoadCallCounters.get(plugin.id) ?? 0) + 1
				);
				const error = loaderThrowersById.get(plugin.id);
				if (error !== undefined) throw new Error(error);
				if (SYNC_PLUGIN_LOADER_HOLD_MS > 0)
					await new Promise((resolve) =>
						setTimeout(resolve, SYNC_PLUGIN_LOADER_HOLD_MS)
					);
				plugin.loaded = true;
				setterAccess('visible');
				return {
					pluginId: plugin.id,
					namespace: plugin.namespace,
					active: true,
					changedToolNames: plugin.descriptors.map((d) => d.name),
					visibleToolNames: plugin.descriptors.map((d) => d.name),
				} as const;
			})().finally(() => {
				if (inFlightActivations.get(plugin.id) === tracked) {
					inFlightActivations.delete(plugin.id);
				}
			});
			inFlightActivations.set(plugin.id, tracked);
			return tracked;
		},
		deactivatePlugin(identifier: string): IPluginSurfaceChange | null {
			const plugin =
				pluginsById.get(identifier) ??
				plugins.find((p) => p.namespace === identifier);
			if (plugin === undefined) return null;
			plugin.deactivated = true;
			plugin.loaded = false;
			setterAccess('deactivated');
			return {
				pluginId: plugin.id,
				namespace: plugin.namespace,
				active: false,
				changedToolNames: plugin.descriptors.map((d) => d.name),
				visibleToolNames: [],
			};
		},
		evictIdlePlugins: () => [],
		hasInFlightWork: () => false,
		getProjectContext: () => ({
			surfaceMode: 'managed',
			workspaceRoot: '/tmp/synthetic-workspace',
			loadedPlugins: [...pluginsById.keys()],
			warmPlugins: [...pluginsById.keys()],
			visibleToolCount: recordsByName.size,
			hiddenToolCount: 0,
			visibleDomains: [...new Set(plugins.map((p) => p.namespace))],
			configIssues: [],
		}),
		resolveRoute(domain: string, action: string) {
			const domainLower = domain.toLowerCase();
			const actionLower = action.toLowerCase();
			const found = [...recordsByName.values()].find(
				(record) =>
					record.toolId.toLowerCase() === actionLower &&
					((record.namespace ?? '').toLowerCase() === domainLower ||
						(record.pluginId ?? '').toLowerCase() === domainLower)
			);
			if (found === undefined) return undefined;
			return {
				registrationId: found.registrationId,
				name: found.name,
				toolId: found.toolId,
				pluginId: found.pluginId,
				namespace: found.namespace,
				summary: found.summary,
				tags: found.tags ?? [],
				active: found.access === 'visible',
				detailsId: found.detailsId,
			};
		},
		async invokeTool(name: string, args: unknown) {
			const record = recordsByName.get(name);
			if (record === undefined) throw new Error(`Unknown tool: ${name}`);
			// Mirror the real runtime: a record with
			// `access === 'deactivated'` is rejected with
			// `ToolNotAuthorizedError` (mapped to `policy_denied` by the
			// resolver). This is the policy boundary.
			if (record.access === 'deactivated') {
				const error = new Error(
					`Tool "${name}" is deactivated and cannot be invoked.`
				);
				error.name = 'ToolNotAuthorizedError';
				throw error;
			}
			const plugin =
				record.pluginId === undefined
					? undefined
					: pluginsById.get(record.pluginId);
			if (
				record.access === 'hidden' &&
				plugin !== undefined &&
				plugin.loaded === false
			) {
				const existing = inFlightLazyLoads.get(plugin.id);
				if (existing !== undefined) {
					await existing;
				} else {
					const lazyLoad = (async () => {
						pluginLoadCallCounters.set(
							plugin.id,
							(pluginLoadCallCounters.get(plugin.id) ?? 0) + 1
						);
						const error = loaderThrowersById.get(plugin.id);
						if (error !== undefined) {
							const activationError = new Error(error);
							activationError.name = 'ToolActivationError';
							throw activationError;
						}
						plugin.loaded = true;
					})().finally(() => {
						if (inFlightLazyLoads.get(plugin.id) === lazyLoad) {
							inFlightLazyLoads.delete(plugin.id);
						}
					});
					inFlightLazyLoads.set(plugin.id, lazyLoad);
					await lazyLoad;
				}
			}
			const error = handlerThrowersByName.get(name);
			if (error !== undefined) throw new Error(error);
			return await (record.handler as (a: unknown) => unknown)(args);
		},
	};

	const port: { get(): IToolSurfaceRuntime | undefined; bind(): void } = {
		get: () => runtime,
		bind: () => undefined,
	};

	const access: IToolSurfaceRuntimeAccess =
		port as unknown as IToolSurfaceRuntimeAccess;

	return {
		port,
		access,
		extra: { synthetic: true } as const,
		activateSync(pluginId: string) {
			runtime.activatePlugin(pluginId);
		},
		deactivatePlugin(pluginId: string) {
			runtime.deactivatePlugin(pluginId);
		},
		makeLoaderThrow(pluginId: string, message: string) {
			loaderThrowersById.set(pluginId, message);
		},
		makeHandlerThrow(toolName: string, message: string) {
			handlerThrowersByName.set(toolName, message);
		},
		trackLoaderInvocations() {
			return {
				callCount(pluginId: string) {
					return pluginLoadCallCounters.get(pluginId) ?? 0;
				},
			};
		},
		trackFilesystemWrites() {
			filesystemWriteCount = 0;
			return {
				count() {
					return filesystemWriteCount;
				},
			};
		},
		dispose() {
			pluginsById.clear();
			recordsByName.clear();
			pluginLoadCallCounters.clear();
			handlerThrowersByName.clear();
			loaderThrowersById.clear();
		},
	};
};

export type FakeRuntimeAccess = ReturnType<typeof buildFakeRuntime>;
