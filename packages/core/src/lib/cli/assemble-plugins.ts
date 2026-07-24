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
import { buildActivationReport } from '../plugins/activation-report';
import { classifyOrigin } from '../plugins/classify-origin';
import type { IMcpPluginContext } from '../plugins/plugin-contract';
import type { createPeerPluginRegistry } from '../plugins/peer-plugin-registry';
import type { IMcpVertexCliArgs } from '../plugins/parse-cli-args';
import { serializeConfigurationSchema } from '../configuration-center/configuration-center';
import type { IOverviewToolEntry } from '../tools/overview-tool';

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
	readonly onToolCalls: Array<
		(
			toolName: string,
			args: unknown,
			result: unknown,
			error?: unknown,
		) => Promise<void> | void
	>;
	readonly onToolStarts: Array<
		(toolName: string, args: unknown) => Promise<void> | void
	>;
	readonly onToolCancels: Array<
		(
			toolName: string,
			args: unknown,
			elapsedMs: number,
		) => Promise<void> | void
	>;
	readonly isAgentStuckFn: IMcpVertexHostConfig['isAgentStuck'];
	readonly activationReport: ReturnType<typeof buildActivationReport>;
	readonly activationById: ReadonlyMap<
		string,
		ReturnType<typeof buildActivationReport>['entries'][number]
	>;
	readonly configurationPlugins: IConfigurationPlugin[];
	readonly configurationArtifacts: IConfigurationArtifact[];
}

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
	// f00087 S1: replace each plugin entry's bare name with its resolved
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

	const loadResult = await loadPlugins({
		specifiers: effectivePlugins,
		workspaceRoot: args.workspace,
		buildContext,
		import: importFn ?? nodeDynamicImport,
	});

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

	const onToolCalls: Array<
		(
			toolName: string,
			args: unknown,
			result: unknown,
			error?: unknown,
		) => Promise<void> | void
	> = [];
	const onToolStarts: Array<
		(toolName: string, args: unknown) => Promise<void> | void
	> = [];
	const onToolCancels: Array<
		(
			toolName: string,
			args: unknown,
			elapsedMs: number,
		) => Promise<void> | void
	> = [];
	let isAgentStuckFn: IMcpVertexHostConfig['isAgentStuck'];

	for (const { plugin, registrations } of loadResult.loaded) {
		const ns =
			pluginConfigFor(fileConfig, plugin.name).prefix ?? plugin.name;
		if (registrations.prompts) prompts.push(...registrations.prompts);
		if (registrations.resources) resources.push(...registrations.resources);
		if (registrations.knowledge) knowledge.push(...registrations.knowledge);
		if (registrations.onToolCall)
			onToolCalls.push(registrations.onToolCall);
		if (registrations.onToolStart)
			onToolStarts.push(registrations.onToolStart);
		if (registrations.onToolCancel)
			onToolCancels.push(registrations.onToolCancel);
		if (registrations.isAgentStuck)
			isAgentStuckFn = registrations.isAgentStuck;
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
		}
	}

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
		isAgentStuckFn,
		activationReport,
		activationById,
		configurationPlugins,
		configurationArtifacts,
	};
};
