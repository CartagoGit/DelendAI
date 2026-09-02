/**
 * assemble-plugins.ts — r00009: the plugin-loading half of the CLI
 * assembly, extracted verbatim from `assembleCliConfig`. Resolves the
 * effective plugin set (CLI flags + config specifiers − exclusions −
 * disabled entries), loads it, projects every registration surface
 * (tools/prompts/resources/knowledge/hooks) into the shapes the host
 * config consumes, and derives the activation + configuration-center
 * projections.
 */
import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import type {
	IConfigurationArtifact,
	IConfigurationPlugin,
} from '../contracts/interfaces/configuration-center.interface';
import {
	pluginConfigFor,
	resolveConfigPluginSpecifiers,
} from '../plugins/load-config-file';
import type { IMcpVertexConfigFile } from '../plugins/load-config-file';
import { loadPlugins, nodeDynamicImport } from '../plugins/load-plugins';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import {
	announcePluginFailures,
	asRegisterErrorInfo,
	buildPluginFailureAnnouncement,
} from '../plugins/announce-plugin-failures';
import { buildActivationReport } from '../plugins/activation-report';
import { classifyOrigin } from '../plugins/classify-origin';
import type {
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '../plugins/plugin-contract';
import type {
	IPluginHookErrorInfo,
	IPluginRegisterErrorInfo,
} from '../contracts/interfaces/plugin-lifecycle-error.interface';
import type { createPeerPluginRegistry } from '../plugins/peer-plugin-registry';
import type { IMcpVertexCliArgs } from '../plugins/parse-cli-args';
import { serializeConfigurationSchema } from '../configuration-center/configuration-center';
import type { IOverviewToolEntry } from '../tools/overview-tool';
import type { IToolSurfaceDescriptor } from '../contracts/interfaces/tool-surface.interface';
import { FIRST_PARTY_PLUGIN_INDEX } from '../registry/first-party-index';
import type { IErrorSink } from '../error-collection/sink.interface';
import {
	MANAGED_LAZY_PLUGIN_BY_ID,
	type MANAGED_LAZY_PLUGIN_CATALOG,
} from '../plugins/managed-lazy-catalog.generated';
import {
	createManagedLazyRuntime,
	validateManagedLazyConfiguration,
} from '../plugins/managed-lazy-runtime';
import {
	announceManagedLazyDemotion,
	buildManagedLazyDemotionNotice,
} from '../plugins/managed-lazy-demotion';
import {
	announceSingleSlotContention,
	buildSingleSlotContention,
	type ISingleSlotClaim,
} from '../plugins/single-slot-hooks';
import { disposeLoadedPlugins } from '../plugins/load-plugins-runtime.helper';
import type { IToolSurfaceLazyBinding } from '../contracts/interfaces/tool-surface.interface';

/** Wraps a raw dispose sweep so a second call is a guaranteed no-op. */
const idempotentDisposePlugins = (
	run: () => Promise<
		readonly { readonly pluginName: string; readonly error: unknown }[]
	>,
): (() => Promise<
	readonly { readonly pluginName: string; readonly error: unknown }[]
>) => {
	let disposed = false;
	return async () => {
		if (disposed) return [];
		disposed = true;
		return run();
	};
};

/** Inputs `assemblePlugins` needs from the config-resolution phase. */
export interface IAssemblePluginsInput {
	readonly args: IMcpVertexCliArgs;
	readonly fileConfig: IMcpVertexConfigFile;
	readonly corePrefix: string;
	readonly configPluginNames: readonly string[];
	readonly disabledConfigPlugins: ReadonlySet<string>;
	readonly buildContext: (pluginName: string) => IMcpPluginContext;
	readonly peerRegistry: ReturnType<typeof createPeerPluginRegistry>;
	readonly importFn?: (specifier: string) => Promise<{ default: unknown }>;
}

/** Everything the rest of the assembly consumes from the plugin phase. */
export interface IAssemblePluginsResult {
	/** Resolved specifier list (CLI + config − exclusions − disabled). */
	readonly effectivePlugins: readonly string[];
	readonly loadResult: IPluginLoadResult;
	readonly prompts: IPromptRegistration[];
	readonly resources: IResourceRegistration[];
	readonly knowledge: IKnowledgeEntry[];
	readonly pluginToolEntries: IOverviewToolEntry[];
	readonly qualifiedPluginTools: IToolRegistration[];
	readonly onToolCalls: readonly IPluginToolCallObserver[];
	readonly onToolStarts: readonly IPluginToolStartObserver[];
	readonly onToolCancels: readonly IPluginToolCancelObserver[];
	readonly onHookErrors: readonly IPluginHookErrorObserver[];
	readonly isAgentStuckFn: IMcpVertexHostConfig['isAgentStuck'];
	readonly getCheckpointAdvisoryFns: Array<
		NonNullable<IMcpVertexHostConfig['getCheckpointAdvisory']>
	>;
	readonly beforeToolCallFns: Array<
		NonNullable<IMcpVertexHostConfig['beforeToolCall']>
	>;
	readonly logsSink: import('../plugins/logs-sink').ILogsSink | undefined;
	readonly errorSinks: readonly IErrorSink[];
	readonly activationReport: ReturnType<typeof buildActivationReport>;
	readonly activationById: ReadonlyMap<
		string,
		ReturnType<typeof buildActivationReport>['entries'][number]
	>;
	readonly toolSurfaceDescriptors: readonly IToolSurfaceDescriptor[];
	readonly configurationPlugins: IConfigurationPlugin[];
	readonly configurationArtifacts: IConfigurationArtifact[];
	readonly pluginSummaries: readonly IOverviewPluginEntry[];
	readonly lazyToolActivators?: ReadonlyMap<
		string,
		() => Promise<IToolSurfaceLazyBinding>
	>;
	readonly lazyPluginActivators?: ReadonlyMap<string, () => Promise<void>>;
	readonly lazyPluginPackages?: readonly {
		readonly name: string;
		readonly resolved: string;
		readonly version?: string;
	}[];
	/** Returns plugin non-tool registrations activated since the last drain. */
	readonly consumeLazyPluginRegistrations?: () => readonly IMcpPluginRegistrations[];
	readonly moduleLoading: 'lazy' | 'eager';
	/**
	 * Dispose every plugin runtime this assembly activated (eager: all of
	 * them up front; lazy: whichever the session actually activated), in
	 * reverse activation order, aggregating per-plugin failures instead of
	 * throwing on the first one. Idempotent — a second call is a no-op.
	 * `McpHostSession.dispose()` (`create-mcp-project.ts`) is the one
	 * caller; see AUD-E02 / r00039.
	 */
	readonly disposePlugins: () => Promise<
		readonly { readonly pluginName: string; readonly error: unknown }[]
	>;
	/**
	 * Dispose exactly one plugin's runtime, by plugin id, without
	 * touching any other plugin — the per-plugin counterpart
	 * `disposePlugins` above lacks (x00286 S4). Present only for the
	 * managed-lazy assembly (`moduleLoading: 'lazy'`): eager plugins
	 * never retain a lazy activator, so `ToolSurfaceRuntime` can never
	 * mark one evictable in the first place, and there is nothing for a
	 * per-plugin disposer to wire into. Delegates to
	 * `IManagedLazyRuntime.disposePlugin`, which is itself idempotent
	 * and shares its "already disposed" bookkeeping with `disposePlugins`
	 * so an evicted-then-shutdown plugin is never disposed twice.
	 */
	readonly disposePlugin?: (pluginId: string) => Promise<void>;
}

interface IOverviewPluginEntry {
	readonly name: string;
	readonly version?: string | undefined;
	readonly describe?: string | undefined;
}

interface IPluginToolCallObserver {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly handler: NonNullable<IMcpVertexHostConfig['onToolCall']>;
}

interface IPluginToolStartObserver {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly handler: NonNullable<IMcpVertexHostConfig['onToolStart']>;
}

interface IPluginToolCancelObserver {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly handler: NonNullable<IMcpVertexHostConfig['onToolCancel']>;
}

interface IPluginHookErrorObserver {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly handler: (info: IPluginHookErrorInfo) => Promise<void> | void;
}

const replayRegisterErrors = async (
	handlers: ReadonlyArray<{
		readonly pluginName: string;
		readonly handler: (
			info: IPluginRegisterErrorInfo,
		) => Promise<void> | void;
	}>,
	errors: readonly IPluginRegisterErrorInfo[],
): Promise<void> => {
	for (const info of errors) {
		for (const observer of handlers) {
			try {
				await observer.handler(info);
			} catch (error) {
				process.stderr.write(
					`[mcp-vertex] onRegisterError error (${observer.pluginName}): ${error instanceof Error ? error.message : String(error)}\n`,
				);
			}
		}
	}
};

/**
 * Record a claim on a single-slot hook and, when it loses to an earlier
 * claimant, say so immediately.
 *
 * Announcing at the moment of contention rather than at the end of
 * assembly is what makes this work on BOTH routes: eager registers
 * everything at boot, while a lazy plugin may claim a slot minutes
 * later, when it is first activated.
 */
const claimSingleSlot = (
	claims: ISingleSlotClaim[],
	slot: ISingleSlotClaim['slot'],
	pluginName: string,
): void => {
	const holder = claims.find((claim) => claim.slot === slot);
	claims.push({ slot, pluginName });
	if (holder === undefined) return;
	announceSingleSlotContention(
		buildSingleSlotContention([
			{ slot, pluginName: holder.pluginName },
			{ slot, pluginName },
		]),
	);
};

const lazyPluginIdFor = (specifier: string): string | undefined => {
	if (MANAGED_LAZY_PLUGIN_BY_ID.has(specifier)) return specifier;
	const prefix = '@mcp-vertex/';
	if (specifier.startsWith(prefix)) {
		const id = specifier.slice(prefix.length);
		return MANAGED_LAZY_PLUGIN_BY_ID.has(id) ? id : undefined;
	}
	return undefined;
};

const sourceForLazyPlugin = (input: {
	readonly id: string;
	readonly args: IMcpVertexCliArgs;
	readonly configPluginNames: readonly string[];
	readonly disabledConfigPlugins: ReadonlySet<string>;
}): 'preset' | 'config' | 'flag' => {
	if (input.args.flagPlugins.includes(input.id)) return 'flag';
	if (input.configPluginNames.includes(input.id)) return 'config';
	if (input.args.presetPlugins.includes(input.id)) return 'preset';
	if (input.disabledConfigPlugins.has(input.id)) return 'config';
	return 'preset';
};

/**
 * Policy-owned plugins must start before the first lazy tool call. A configured
 * automatic Git policy is a lifecycle guarantee, not a tool the model has to
 * remember to invoke.
 */
export const requiresPolicyStartupActivation = (
	pluginId: string,
	options: Readonly<Record<string, unknown>> | undefined,
): boolean => {
	if (pluginId !== 'commit-policy' || options === undefined) return false;
	const commit = options.commit;
	const cadence = options.cadence;
	const push = options.push;
	const commitEnabled =
		typeof commit === 'object' &&
		commit !== null &&
		(commit as { readonly enabled?: unknown }).enabled === true;
	const triggers =
		typeof cadence === 'object' && cadence !== null
			? (cadence as { readonly triggers?: unknown }).triggers
			: undefined;
	const automaticTrigger =
		Array.isArray(triggers) &&
		triggers.some(
			(trigger) =>
				typeof trigger === 'object' &&
				trigger !== null &&
				(trigger as { readonly kind?: unknown }).kind !== 'manual',
		);
	const pushOnCommit =
		typeof push === 'object' &&
		push !== null &&
		(push as { readonly onCommit?: unknown }).onCommit === true;
	const pushPeriodic =
		typeof push === 'object' &&
		push !== null &&
		((push as { readonly everyNCommits?: unknown }).everyNCommits !==
			undefined ||
			(push as { readonly everyNMinutes?: unknown }).everyNMinutes !==
				undefined);
	const pushEnabled =
		typeof push === 'object' &&
		push !== null &&
		(push as { readonly enabled?: unknown }).enabled === true;
	return (
		(commitEnabled && automaticTrigger) ||
		(pushEnabled && (pushOnCommit || pushPeriodic))
	);
};

const tryAssembleManagedLazy = async (input: {
	readonly args: IMcpVertexCliArgs;
	readonly fileConfig: IMcpVertexConfigFile;
	readonly corePrefix: string;
	readonly configPluginNames: readonly string[];
	readonly disabledConfigPlugins: ReadonlySet<string>;
	readonly peerRegistry: IAssemblePluginsInput['peerRegistry'];
	readonly effectivePlugins: readonly string[];
	readonly buildContext: IAssemblePluginsInput['buildContext'];
	readonly importFn: (specifier: string) => Promise<unknown>;
}): Promise<IAssemblePluginsResult | undefined> => {
	const loading = input.fileConfig.managedSurface?.loading ?? 'lazy';
	if (loading !== 'lazy') return undefined;
	// Native is an explicit compatibility contract: it needs real eager MCP
	// registrations, so never pair it with the managed lazy activator table.
	if (
		input.args.surfaceMode === 'native' ||
		input.args.tokens.surface === 'native' ||
		input.fileConfig.surfaceMode === 'native'
	)
		return undefined;
	const ids = input.effectivePlugins.map(lazyPluginIdFor);
	if (ids.some((id): id is undefined => id === undefined)) {
		// All-or-nothing by construction: the runtime routes tool calls
		// through the generated index, so a plugin missing from it would
		// own tools nobody could activate. Falling back to eager is the
		// right degradation — but doing it silently made "someone added a
		// plugin and did not regenerate the catalog" look like the server
		// merely getting slower.
		announceManagedLazyDemotion(
			buildManagedLazyDemotionNotice({
				effectivePlugins: input.effectivePlugins,
				isIndexed: (specifier) =>
					lazyPluginIdFor(specifier) !== undefined,
			}),
		);
		return undefined;
	}
	const pluginIds = ids as string[];
	const namespaces = new Map(
		pluginIds.map((id) => [
			id,
			pluginConfigFor(input.fileConfig, id).prefix ?? id,
		]),
	);
	const definitions = pluginIds
		.map((id) => MANAGED_LAZY_PLUGIN_BY_ID.get(id))
		.filter(
			(entry): entry is (typeof MANAGED_LAZY_PLUGIN_CATALOG)[number] =>
				entry !== undefined,
		);
	input.peerRegistry.set(pluginIds);
	const pluginOptions = new Map(
		Object.entries(input.fileConfig.plugins ?? {}).map(([name, config]) => [
			name,
			config.options ?? {},
		]),
	);
	const configurationIssues = await validateManagedLazyConfiguration({
		plugins: definitions,
		buildContext: input.buildContext,
		pluginOptions,
		enabledPlugins: pluginIds,
		importFn: input.importFn,
	});
	if (configurationIssues.length > 0) {
		throw new Error(configurationIssues.join('\n\n'));
	}
	const onToolCalls: IPluginToolCallObserver[] = [];
	const onToolStarts: IPluginToolStartObserver[] = [];
	const onToolCancels: IPluginToolCancelObserver[] = [];
	const onHookErrors: IPluginHookErrorObserver[] = [];
	const getCheckpointAdvisoryFns: Array<
		NonNullable<IMcpVertexHostConfig['getCheckpointAdvisory']>
	> = [];
	const beforeToolCallFns: Array<
		NonNullable<IMcpVertexHostConfig['beforeToolCall']>
	> = [];
	let isAgentStuckFn: IMcpVertexHostConfig['isAgentStuck'];
	let resolvedLogsSink: import('../plugins/logs-sink').ILogsSink | undefined;
	let resolvedErrorSinks: IErrorSink[] = [];
	// `logsSink` and `isAgentStuck` are single slots: the host routes logs
	// to one destination and gets one answer about stuckness. Both resolve
	// first-wins; the claims are recorded so a dropped second provider is
	// named rather than silently never being called.
	const singleSlotClaims: ISingleSlotClaim[] = [];
	const lazyErrors: Array<{ specifier: string; message: string }> = [];
	const lazyLoadResult: IPluginLoadResult = {
		loaded: [],
		errors: lazyErrors,
		registerErrors: [],
	};
	const prompts: IPromptRegistration[] = [];
	const resources: IResourceRegistration[] = [];
	const knowledge: IKnowledgeEntry[] = [];
	const pendingRegistrations = new Map<string, IMcpPluginRegistrations>();
	const lazyRuntime = createManagedLazyRuntime({
		namespacePrefix: input.corePrefix,
		plugins: definitions,
		namespaces,
		buildContext: input.buildContext,
		importFn: input.importFn,
		onActivated: ({ plugin, registrations, resolvedSpecifier }) => {
			pendingRegistrations.set(plugin.name, registrations);
			if (registrations.prompts) prompts.push(...registrations.prompts);
			if (registrations.resources)
				resources.push(...registrations.resources);
			if (registrations.knowledge)
				knowledge.push(...registrations.knowledge);
			if (registrations.onToolCall)
				onToolCalls.push({
					pluginName: plugin.name,
					resolvedSpecifier,
					handler: registrations.onToolCall,
				});
			if (registrations.onToolStart)
				onToolStarts.push({
					pluginName: plugin.name,
					resolvedSpecifier,
					handler: registrations.onToolStart,
				});
			if (registrations.onToolCancel)
				onToolCancels.push({
					pluginName: plugin.name,
					resolvedSpecifier,
					handler: registrations.onToolCancel,
				});
			if (registrations.onHookError)
				onHookErrors.push({
					pluginName: plugin.name,
					resolvedSpecifier,
					handler: registrations.onHookError,
				});
			if (registrations.isAgentStuck) {
				claimSingleSlot(singleSlotClaims, 'isAgentStuck', plugin.name);
				if (isAgentStuckFn === undefined) {
					isAgentStuckFn = registrations.isAgentStuck;
				}
			}
			if (registrations.getCheckpointAdvisory)
				getCheckpointAdvisoryFns.push(
					registrations.getCheckpointAdvisory,
				);
			if (registrations.beforeToolCall)
				beforeToolCallFns.push(registrations.beforeToolCall);
			if (registrations.logsSink) {
				claimSingleSlot(singleSlotClaims, 'logsSink', plugin.name);
				if (resolvedLogsSink === undefined)
					resolvedLogsSink = registrations.logsSink;
			}
			if (registrations.errorSinks)
				resolvedErrorSinks = [
					...resolvedErrorSinks,
					...registrations.errorSinks.filter(
						(sink) =>
							!resolvedErrorSinks.some(
								(existing) => existing.id === sink.id,
							),
					),
				];
		},
		onActivationError: ({ pluginId, resolvedSpecifier, error }) => {
			const message =
				error instanceof Error ? error.message : String(error);
			if (
				!lazyErrors.some(
					(entry) =>
						entry.specifier === pluginId &&
						entry.message === message,
				)
			) {
				const failure = {
					specifier: pluginId,
					message: `could not activate plugin "${pluginId}" from "${resolvedSpecifier}": ${message}`,
				};
				lazyErrors.push(failure);
				// A lazy activation fails AFTER assembly — typically the
				// first time an agent reaches for the plugin's tools — so
				// the start-up announcement cannot have covered it. Say so
				// here, at the moment it happens. Otherwise the agent sees
				// a tool that simply does not answer and retries it
				// forever. The failure also stays in `lazyErrors`, which is
				// this route's `IPluginLoadResult.errors`, so every
				// downstream consumer still sees it.
				announcePluginFailures(
					buildPluginFailureAnnouncement({
						loadErrors: [failure],
						registerErrors: [],
						loadedCount: pendingRegistrations.size,
					}),
				);
			}
		},
	});
	const configuredStartupPlugins = definitions.filter((plugin) => {
		const options = pluginConfigFor(input.fileConfig, plugin.id).options;
		// Startup activation is a lifecycle guarantee, not an opt-in
		// heuristic. Activate every configured startup plugin before the
		// first lazy event so malformed options reach the plugin's schema
		// validation and cannot silently disable its listeners.
		return (
			plugin.startupActivation === true ||
			requiresPolicyStartupActivation(plugin.id, options)
		);
	});
	await Promise.all(
		configuredStartupPlugins.map(async (plugin) => {
			try {
				await lazyRuntime.activatePlugin(plugin.id);
			} catch {
				// The runtime has already recorded the detailed error. Keep
				// unrelated startup plugins available.
			}
		}),
	);
	const pluginToolEntries: IOverviewToolEntry[] = [];
	const toolSurfaceDescriptors: IToolSurfaceDescriptor[] = [];
	const lazyToolActivators = new Map<
		string,
		() => Promise<IToolSurfaceLazyBinding>
	>();
	const lazyPluginActivators = new Map<string, () => Promise<void>>();
	for (const plugin of definitions) {
		const namespace = namespaces.get(plugin.id) ?? plugin.id;
		const activatePlugin = () => lazyRuntime.activatePlugin(plugin.id);
		lazyPluginActivators.set(plugin.id, activatePlugin);
		lazyPluginActivators.set(namespace, activatePlugin);
		for (const toolId of plugin.toolIds) {
			const name = `${input.corePrefix}_${namespace}_${toolId}`;
			const tags = [...(plugin.tags ?? []), 'lazy'];
			pluginToolEntries.push({
				name,
				plugin: namespace,
				id: toolId,
				summary: plugin.summary,
				tags,
			});
			toolSurfaceDescriptors.push({
				registrationId: name,
				name,
				toolId,
				pluginId: plugin.id,
				namespace,
				summary: plugin.summary,
				tags,
			});
			lazyToolActivators.set(name, () => lazyRuntime.activateTool(name));
		}
	}
	const contributions = pluginIds.map((id) => ({
		id,
		origin: 'bundled' as const,
		source: sourceForLazyPlugin({
			id,
			args: input.args,
			configPluginNames: input.configPluginNames,
			disabledConfigPlugins: input.disabledConfigPlugins,
		}),
		active: false,
		toolCount: MANAGED_LAZY_PLUGIN_BY_ID.get(id)?.toolIds.length ?? 0,
	}));
	const activationReport = buildActivationReport(
		[],
		{
			fromFlag: new Set(input.args.flagPlugins),
			fromConfig: new Set(input.configPluginNames),
			fromPreset: new Set(input.args.presetPlugins),
		},
		contributions,
	);
	const activationById = new Map(
		activationReport.entries.map((entry) => [entry.id, entry]),
	);
	const configurationPlugins: IConfigurationPlugin[] = pluginIds.map((id) => {
		const configEntry = pluginConfigFor(input.fileConfig, id);
		const catalogEntry = MANAGED_LAZY_PLUGIN_BY_ID.get(id);
		const permissions = FIRST_PARTY_PLUGIN_INDEX.entries.find(
			(entry) => entry.id === id,
		)?.permissions;
		return {
			id,
			origin: 'bundled',
			active: false,
			source: activationById.get(id)?.source ?? 'config',
			...(configEntry.path === undefined
				? {}
				: { path: configEntry.path }),
			...(configEntry.prefix === undefined
				? {}
				: { prefix: configEntry.prefix }),
			options: configEntry.options ?? {},
			schemaStatus: 'unavailable',
			dependencies: catalogEntry?.dependencies ?? [],
			...(permissions === undefined ? {} : { permissions }),
			capabilities: {
				tools: catalogEntry?.toolIds.length ?? 0,
				prompts: catalogEntry?.promptIds.length ?? 0,
				resources: catalogEntry?.resourceIds.length ?? 0,
				knowledge: catalogEntry?.knowledgeIds.length ?? 0,
				skills: catalogEntry?.skillIds.length ?? 0,
			},
		};
	});
	const configurationArtifacts: IConfigurationArtifact[] =
		definitions.flatMap((plugin) => [
			...plugin.promptIds.map((id) => ({
				id,
				kind: 'prompt' as const,
				owner: { id: plugin.id, origin: 'bundled' as const },
			})),
			...plugin.resourceIds.map((id) => ({
				id,
				kind: 'resource' as const,
				owner: { id: plugin.id, origin: 'bundled' as const },
			})),
			...plugin.knowledgeIds.map((id) => ({
				id,
				kind: 'knowledge' as const,
				owner: { id: plugin.id, origin: 'bundled' as const },
			})),
		]);
	return {
		effectivePlugins: input.effectivePlugins,
		loadResult: lazyLoadResult,
		prompts,
		resources,
		knowledge,
		pluginToolEntries,
		qualifiedPluginTools: [],
		onToolCalls,
		onToolStarts,
		onToolCancels,
		onHookErrors,
		isAgentStuckFn,
		getCheckpointAdvisoryFns,
		beforeToolCallFns,
		logsSink: resolvedLogsSink,
		errorSinks: resolvedErrorSinks,
		activationReport,
		activationById,
		toolSurfaceDescriptors,
		configurationPlugins,
		configurationArtifacts,
		pluginSummaries: pluginIds.map((id) => ({
			name: id,
			describe: MANAGED_LAZY_PLUGIN_BY_ID.get(id)?.summary,
		})),
		lazyToolActivators,
		lazyPluginActivators,
		lazyPluginPackages: pluginIds.map((id) => ({
			name: id,
			resolved: MANAGED_LAZY_PLUGIN_BY_ID.get(id)?.packageSpecifier ?? id,
		})),
		consumeLazyPluginRegistrations: () => {
			const drained = [...pendingRegistrations.values()];
			pendingRegistrations.clear();
			return drained;
		},
		moduleLoading: 'lazy',
		disposePlugins: idempotentDisposePlugins(async () => {
			const failures = await lazyRuntime.disposeAll();
			return failures.map((failure) => ({
				pluginName: failure.pluginId,
				error: failure.error,
			}));
		}),
		disposePlugin: (pluginId) => lazyRuntime.disposePlugin(pluginId),
	};
};

export const assemblePlugins = async (
	input: IAssemblePluginsInput,
): Promise<IAssemblePluginsResult> => {
	const {
		args,
		fileConfig,
		corePrefix,
		configPluginNames,
		disabledConfigPlugins,
		buildContext,
		peerRegistry,
		importFn,
	} = input;
	const excludedPlugins = new Set(args.excludePlugins);
	// S1: replace each plugin entry's bare name with its resolved
	// `path` when the config declares one. Entries without `path`
	// contribute their key as-is, preserving the historical behaviour
	// (`loadPlugins` runs the scoped-name fallback chain against it).
	const resolvedConfigSpecifiers = resolveConfigPluginSpecifiers(
		fileConfig,
		args.workspace,
	);
	const effectivePlugins = [
		...new Set([...args.plugins, ...resolvedConfigSpecifiers]),
	].filter((specifier) => {
		// Exclude by the entry KEY (the canonical plugin name in the
		// config file). A plugin loaded via a custom path still resolves
		// to `IMcpPlugin.name` after register, so excluding by the
		// config key matches what the user wrote in --exclude-plugins.
		const keys = Object.keys(fileConfig.plugins ?? {});
		const matchedKey = keys.find((key) => {
			const entry = fileConfig.plugins?.[key];
			return entry?.path === specifier || key === specifier;
		});
		if (matchedKey === undefined) {
			// CLI-only specifier — cannot match any config key.
			return (
				!excludedPlugins.has(specifier) &&
				!disabledConfigPlugins.has(specifier)
			);
		}
		return (
			!excludedPlugins.has(matchedKey) &&
			!disabledConfigPlugins.has(matchedKey)
		);
	});
	const managedLazy = await tryAssembleManagedLazy({
		args,
		fileConfig,
		corePrefix,
		configPluginNames,
		disabledConfigPlugins,
		peerRegistry,
		effectivePlugins,
		buildContext,
		importFn:
			importFn ??
			((specifier) => nodeDynamicImport(specifier, args.workspace)),
	});
	if (managedLazy !== undefined) return managedLazy;

	let loadResult: IPluginLoadResult = await loadPlugins({
		specifiers: effectivePlugins,
		workspaceRoot: args.workspace,
		buildContext,
		import:
			importFn ??
			((specifier) => nodeDynamicImport(specifier, args.workspace)),
	});
	const configurationErrors = loadResult.errors.filter(
		(error) => error.specifier === 'configuration',
	);
	if (configurationErrors.length > 0) {
		throw new Error(
			configurationErrors.map((error) => error.message).join('\n\n'),
		);
	}

	// S4 — `--strict-logs` auto-injects the `logs` plugin when
	// the host did not name it explicitly. The injection is a no-op if
	// `logs` is already in the load set; otherwise we re-load with the
	// added specifier and warn once on stderr. The auto-load is
	// deliberately idempotent: a host that adds `logs` to its preset
	// never sees a duplicate.
	if (
		args.strictLogs === true &&
		!loadResult.loaded.some((p) => p.plugin.name === 'logs')
	) {
		process.stderr.write(
			'[mcp-vertex] --strict-logs: auto-loading the `logs` plugin to persist lifecycle events.\n',
		);
		const autoLoad = await loadPlugins({
			specifiers: [...effectivePlugins, 'logs'],
			workspaceRoot: args.workspace,
			buildContext,
			import:
				importFn ??
				((specifier) => nodeDynamicImport(specifier, args.workspace)),
		});
		// Merge: every plugin from the original load survives, plus
		// any from the auto-load that are not already there. We
		// rebuild `loadResult` as a NEW object with a fresh `loaded`
		// array — the previous version cast through `readonly` and
		// mutated the upstream immutable field, which lied to the
		// type system and could surprise downstream consumers that
		// snapshot `loadResult.loaded` once (f00154 S2 audit).
		const seen = new Set(loadResult.loaded.map((p) => p.plugin.name));
		const additions = autoLoad.loaded.filter(
			(entry) => !seen.has(entry.plugin.name),
		);
		if (additions.length > 0) {
			loadResult = {
				...loadResult,
				loaded: [...loadResult.loaded, ...additions],
				errors: [...loadResult.errors, ...autoLoad.errors],
				registerErrors: [
					...loadResult.registerErrors,
					...autoLoad.registerErrors,
				],
			};
		}
	}

	// Populate the peer-plugin registry now that we know the final
	// load outcome. Plugins running their `register()` see `[]`; tool
	// handlers (which run later, after this call returns) see the
	// canonical peer set.
	peerRegistry.set(loadResult.loaded.map((entry) => entry.plugin.name));

	const prompts: IPromptRegistration[] = [];
	const resources: IResourceRegistration[] = [];
	const knowledge: IKnowledgeEntry[] = [];
	const pluginToolEntries: IOverviewToolEntry[] = [];
	// Plugin tools, with their id namespaced to the plugin's prefix. Two
	// plugins may legitimately ship a tool with the same internal id (e.g.
	// `status`); the MCP names (`a_status`, `b_status`) never collide, so
	// the registration-order uniqueness check must run on the qualified id,
	// not the raw one.
	const qualifiedPluginTools: IToolRegistration[] = [];
	const toolSurfaceDescriptors: IToolSurfaceDescriptor[] = [];

	const onToolCalls: IPluginToolCallObserver[] = [];
	const onToolStarts: IPluginToolStartObserver[] = [];
	const onToolCancels: IPluginToolCancelObserver[] = [];
	const onHookErrors: IPluginHookErrorObserver[] = [];
	const onRegisterErrors: Array<{
		readonly pluginName: string;
		readonly handler: (
			info: IPluginRegisterErrorInfo,
		) => Promise<void> | void;
	}> = [];
	let isAgentStuckFn: IMcpVertexHostConfig['isAgentStuck'];
	const getCheckpointAdvisoryFns: Array<
		NonNullable<IMcpVertexHostConfig['getCheckpointAdvisory']>
	> = [];
	const beforeToolCallFns: Array<
		NonNullable<IMcpVertexHostConfig['beforeToolCall']>
	> = [];
	// S2 — every plugin can register a logsSink; we pick the
	// first one that does. The `logs` plugin's sink is the canonical
	// choice when both are present.
	let resolvedLogsSink: import('../plugins/logs-sink').ILogsSink | undefined;
	// Collect all error sinks from every plugin; dedupe by id.
	let resolvedErrorSinks: readonly IErrorSink[] = [];
	const eagerSingleSlotClaims: ISingleSlotClaim[] = [];
	for (const { plugin, registrations } of loadResult.loaded) {
		const resolvedSpecifier =
			loadResult.loaded.find((entry) => entry.plugin.name === plugin.name)
				?.resolved ?? plugin.name;
		const ns =
			pluginConfigFor(fileConfig, plugin.name).prefix ?? plugin.name;
		if (registrations.prompts) prompts.push(...registrations.prompts);
		if (registrations.resources) resources.push(...registrations.resources);
		if (registrations.knowledge) knowledge.push(...registrations.knowledge);
		if (registrations.onToolCall)
			onToolCalls.push({
				pluginName: plugin.name,
				resolvedSpecifier,
				handler: registrations.onToolCall,
			});
		if (registrations.onToolStart)
			onToolStarts.push({
				pluginName: plugin.name,
				resolvedSpecifier,
				handler: registrations.onToolStart,
			});
		if (registrations.onToolCancel)
			onToolCancels.push({
				pluginName: plugin.name,
				resolvedSpecifier,
				handler: registrations.onToolCancel,
			});
		if (registrations.onHookError)
			onHookErrors.push({
				pluginName: plugin.name,
				resolvedSpecifier,
				handler: registrations.onHookError,
			});
		if (registrations.onRegisterError)
			onRegisterErrors.push({
				pluginName: plugin.name,
				handler: registrations.onRegisterError,
			});
		if (registrations.isAgentStuck) {
			claimSingleSlot(eagerSingleSlotClaims, 'isAgentStuck', plugin.name);
			// First-wins, matching `logsSink`: the resolution must not
			// depend on plugin order.
			if (isAgentStuckFn === undefined)
				isAgentStuckFn = registrations.isAgentStuck;
		}
		if (registrations.getCheckpointAdvisory)
			getCheckpointAdvisoryFns.push(registrations.getCheckpointAdvisory);
		if (registrations.beforeToolCall)
			beforeToolCallFns.push(registrations.beforeToolCall);
		if (registrations.logsSink) {
			claimSingleSlot(eagerSingleSlotClaims, 'logsSink', plugin.name);
			if (resolvedLogsSink === undefined) {
				resolvedLogsSink = registrations.logsSink;
			}
		}
		if (registrations.errorSinks) {
			// Deterministic dedupe by id, preserve first-seen order.
			const seen = new Set(resolvedErrorSinks.map((s) => s.id));
			for (const sink of registrations.errorSinks) {
				if (!seen.has(sink.id)) {
					seen.add(sink.id);
					resolvedErrorSinks = [...resolvedErrorSinks, sink];
				}
			}
		}
		for (const tool of registrations.tools ?? []) {
			// Every plugin tool is qualified with the host's core namespace
			// prefix (`mcp-vertex` by default) followed by the plugin's own
			// prefix. This makes the tool owner discoverable at a glance
			// when several MCP servers are loaded side by side, and keeps
			// the in-plugin uniqueness guarantee of `${ns}_${tool.id}`.
			const qualifiedId = `${corePrefix}_${ns}_${tool.id}`;
			pluginToolEntries.push({
				name: qualifiedId,
				// plugin + unqualified id let the compact overview group tools
				// by plugin without re-parsing the qualified name (plugin names
				// may contain `-`, tool ids `_`).
				plugin: ns,
				id: tool.id,
				summary: tool.summary,
				tags: tool.tags,
				...(tool.effects ? { effects: tool.effects } : {}),
			});
			qualifiedPluginTools.push({
				...tool,
				id: qualifiedId,
				// The i18n catalogue key follows the same qualification as
				// the MCP id, so `apps/web/src/i18n/tools/<key>.ts` files
				// are looked up under the fully-qualified name.
				...(tool.descriptionKey !== undefined
					? { descriptionKey: `${corePrefix}_${tool.descriptionKey}` }
					: {}),
				// A same-plugin anchor must point at the qualified id too.
				...(tool.registerAfter !== undefined
					? {
							registerAfter: `${corePrefix}_${ns}_${tool.registerAfter}`,
						}
					: {}),
			});
			toolSurfaceDescriptors.push({
				registrationId: qualifiedId,
				name: qualifiedId,
				toolId: tool.id,
				pluginId: plugin.name,
				namespace: ns,
				...(tool.summary !== undefined
					? { summary: tool.summary }
					: {}),
				...(tool.tags !== undefined ? { tags: tool.tags } : {}),
			});
		}
	}
	// A plugin that failed is degraded, not fatal — but it must be VISIBLE.
	// Until now the failure reached the operator only as an absence: tools
	// that should exist do not, and an agent cannot tell "never installed"
	// from "failed to start", so it retries the call or treats the gap as
	// work to do. Announce once on stderr, and route load failures (which
	// never reach `register()` and so produced no observer event at all)
	// through the same `onRegisterError` observers the error-reporting
	// plugin already subscribes to.
	announcePluginFailures(
		buildPluginFailureAnnouncement({
			loadErrors: loadResult.errors,
			registerErrors: loadResult.registerErrors,
			loadedCount: loadResult.loaded.length,
		}),
	);
	await replayRegisterErrors(
		onRegisterErrors,
		loadResult.errors.map(asRegisterErrorInfo),
	);
	await replayRegisterErrors(onRegisterErrors, loadResult.registerErrors);

	const configNameBySpecifier = new Map(
		configPluginNames.map((name, index) => [
			resolvedConfigSpecifiers[index] ?? name,
			name,
		]),
	);
	const loadedNamesFor = (specifiers: ReadonlySet<string>): Set<string> =>
		new Set(
			loadResult.loaded
				.filter(
					(entry) =>
						specifiers.has(entry.specifier) ||
						specifiers.has(entry.plugin.name),
				)
				.map((entry) => entry.plugin.name),
		);
	const configSourceSpecifiers = new Set([
		...configPluginNames,
		...resolvedConfigSpecifiers,
	]);
	const activationReport = buildActivationReport(
		loadResult.loaded.map((entry) => {
			const configName = configNameBySpecifier.get(entry.specifier);
			return {
				name: entry.plugin.name,
				resolvedSpecifier: entry.resolved,
				hasExplicitPath:
					configName !== undefined &&
					pluginConfigFor(fileConfig, configName).path !== undefined,
				isExternalServer: false,
				toolCount: entry.registrations.tools?.length ?? 0,
			};
		}),
		{
			fromFlag: loadedNamesFor(new Set(args.flagPlugins)),
			fromConfig: loadedNamesFor(configSourceSpecifiers),
			fromPreset: loadedNamesFor(new Set(args.presetPlugins)),
		},
		loadResult.loaded
			.flatMap((entry) => entry.registrations.activation ?? [])
			.concat(
				[...disabledConfigPlugins].map((name) => {
					const entry = pluginConfigFor(fileConfig, name);
					const resolvedSpecifier =
						[...configNameBySpecifier.entries()].find(
							([, configName]) => configName === name,
						)?.[0] ?? `@mcp-vertex/${name}`;
					return {
						id: name,
						origin:
							entry.origin ??
							classifyOrigin({
								name,
								resolvedSpecifier,
								hasExplicitPath: entry.path !== undefined,
							}),
						source: 'config' as const,
						active: false,
						toolCount: 0,
					};
				}),
			),
	);
	const activationById = new Map(
		activationReport.entries.map((entry) => [entry.id, entry]),
	);
	const configurationContributionById = new Map(
		loadResult.loaded.flatMap((entry) =>
			(entry.registrations.activation ?? [])
				.filter((item) => item.configuration !== undefined)
				.map((item) => [item.id, item.configuration!] as const),
		),
	);
	const loadedByName = new Map(
		loadResult.loaded.map((entry) => [entry.plugin.name, entry]),
	);
	const firstPartyPermissionsById = new Map(
		FIRST_PARTY_PLUGIN_INDEX.entries
			.filter((entry) => entry.permissions !== undefined)
			.map((entry) => [entry.id, entry.permissions] as const),
	);
	const configurationPlugins: IConfigurationPlugin[] =
		activationReport.entries.map((activation) => {
			const loaded = loadedByName.get(activation.id);
			const contributed = configurationContributionById.get(
				activation.id,
			);
			const configName =
				loaded === undefined
					? activation.id
					: (configNameBySpecifier.get(loaded.specifier) ??
						activation.id);
			const configEntry = pluginConfigFor(fileConfig, configName);
			const runtimeSchema =
				loaded?.plugin.optionsSchema ?? contributed?.optionsSchema;
			const optionsSchema =
				runtimeSchema === undefined
					? undefined
					: serializeConfigurationSchema(runtimeSchema);
			const runtimeManifest = (
				loaded?.plugin as
					| {
							readonly manifest?: {
								readonly permissions?: readonly import('../contracts/interfaces/permission.interface').PermissionCategory[];
							};
					  }
					| undefined
			)?.manifest;
			const permissions =
				runtimeManifest?.permissions ??
				firstPartyPermissionsById.get(activation.id);
			return {
				id: activation.id,
				origin: activation.origin,
				active: activation.active,
				source: activation.source,
				...(configEntry.path === undefined
					? {}
					: { path: configEntry.path }),
				...(configEntry.prefix === undefined
					? {}
					: { prefix: configEntry.prefix }),
				options: contributed?.options ?? configEntry.options ?? {},
				...(optionsSchema === undefined ? {} : { optionsSchema }),
				schemaStatus:
					optionsSchema === undefined ? 'unavailable' : 'available',
				...(loaded?.plugin.configExample !== undefined
					? { configExample: loaded.plugin.configExample.options }
					: contributed?.configExample === undefined
						? {}
						: { configExample: contributed.configExample }),
				...(permissions === undefined ? {} : { permissions }),
				dependencies: loaded?.plugin.dependsOn ?? [],
				capabilities: {
					tools: loaded?.registrations.tools?.length ?? 0,
					prompts: loaded?.registrations.prompts?.length ?? 0,
					resources: loaded?.registrations.resources?.length ?? 0,
					knowledge: loaded?.registrations.knowledge?.length ?? 0,
					skills: loaded?.registrations.skills?.length ?? 0,
				},
			};
		});
	const configurationArtifacts: IConfigurationArtifact[] =
		loadResult.loaded.flatMap((entry) => {
			const activation = activationById.get(entry.plugin.name);
			const owner = {
				id: entry.plugin.name,
				origin: activation?.origin ?? ('unknown' as const),
			};
			return [
				...(entry.registrations.prompts ?? []).map((item) => ({
					id: item.id,
					kind: 'prompt' as const,
					owner,
				})),
				...(entry.registrations.resources ?? []).map((item) => ({
					id: item.id,
					kind: 'resource' as const,
					owner,
				})),
				...(entry.registrations.knowledge ?? []).map((item) => ({
					id: item.id,
					kind: 'knowledge' as const,
					owner,
				})),
			];
		});

	return {
		effectivePlugins,
		loadResult,
		prompts,
		resources,
		knowledge,
		pluginToolEntries,
		qualifiedPluginTools,
		onToolCalls,
		onToolStarts,
		onToolCancels,
		onHookErrors,
		isAgentStuckFn,
		getCheckpointAdvisoryFns,
		beforeToolCallFns,
		logsSink: resolvedLogsSink,
		errorSinks: resolvedErrorSinks,
		activationReport,
		activationById,
		toolSurfaceDescriptors,
		configurationPlugins,
		configurationArtifacts,
		pluginSummaries: loadResult.loaded.map((entry) => ({
			name: entry.plugin.name,
			version: entry.plugin.version,
			describe: entry.plugin.describe,
		})),
		moduleLoading: 'eager',
		disposePlugins: idempotentDisposePlugins(async () => {
			const failures: {
				readonly pluginName: string;
				readonly error: unknown;
			}[] = [];
			// Reverse-order, error-aggregating dispose — the exact same
			// helper `registerResolvedPluginsWithLifecycle` uses to roll
			// back a partially-registered batch, reused here for full
			// teardown (AUD-E02 / r00039).
			await disposeLoadedPlugins(loadResult.loaded, {
				onError: (entry, error) => {
					failures.push({ pluginName: entry.plugin.name, error });
				},
			});
			return failures;
		}),
	};
};
