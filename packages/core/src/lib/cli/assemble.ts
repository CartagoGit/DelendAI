import { existsSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IResolvedHostIdentity } from '../contracts/interfaces/resolved-host-identity.interface';
import type { IDelendaiHostConfig } from '../contracts/interfaces/host-config.interface';
import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
	SafeToolCategory,
	ToolOwner,
} from '../contracts/interfaces/safe-tool-identity.interface';
import {
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	diagnosePluginPathConfig,
	parseConfigFile,
	pluginConfigFor,
} from '../plugins/load-config-file';
import { diagnoseWorkspaceLayout } from '../plugins/diagnose-workspace-layout';
import type { WorkspacePathStatus } from '../contracts/interfaces/workspace-layout.interface';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpPluginContext } from '../plugins/plugin-contract';
import { createPeerPluginRegistry } from '../plugins/peer-plugin-registry';
import type { IDelendaiCliArgs } from '../plugins/parse-cli-args';
import { classifyOrigin } from '../plugins/classify-origin';
import { joinRel } from '../shared/paths';
import {
	createGitConfigReader,
	resolveCommitAuthor,
} from '../shared/commit-author';
import { createGitRunner } from '../shared/git-write';
import { createEffectBroker } from '../capabilities/effect-broker.factory';
import type { IPluginEffectsCapability } from '../contracts/interfaces/effect-capabilities.interface';
import type { IToolSummary } from '../catalog/agent-discovery-types';
import { createWorkspacePathProvider } from '../workspace/create-workspace-path-provider';
import type {
	ICacheEvictionReport,
	ICacheEvictionRegistry,
} from '../contracts/interfaces/cache-eviction.interface';
import { createCacheEvictionRegistry } from '../cache/eviction-registry';
import { resolveWorkspaceContained } from '../shared/contain-path';
import type { ILogsSink } from '../plugins/plugin-contract';
import { ConsoleLogsSink } from '../plugins/logs-sink';
import type { IErrorCollector } from '../error-collection/collector.interface';
import type { IErrorSink } from '../error-collection/sink.interface';
import { createErrorCollector } from '../error-collection/collector.service';
import { ConsoleErrorSink } from '../error-collection/console-sink';
import { createDefaultSeverityClassifier } from '../error-collection/severity-classifier';
import { createDefaultRedactionPolicy } from '../error-collection/redaction-policy';
import type { IToolSurfaceDescriptor } from '../contracts/interfaces/tool-surface.interface';
import type { IToolSurfacePlan } from '../contracts/interfaces/tool-surface.interface';
import { assemblePlugins } from './assemble-plugins';
import { assembleCoreTools } from './assemble-core-tools';
import { assembleSkills } from './assemble-skills';
import { createToolSurfaceRuntimeAccess } from '../project/tool-surface-runtime.service';
import {
	createEvidenceStore,
	type IEvidenceStoreWithCleanup,
} from '../evidence/evidence-store';
import { BOOTSTRAP_CORE_TOOL_IDS } from '../contracts/constants/bootstrap-core-tool-ids.constant';
import {
	resolveExplicitSurfaceMode,
	resolveInitialSurfaceMode,
} from '../surface/decide-mode';
import {
	mergeCheckpointAdvisories,
	selectCheckpointAdvisory,
} from '../shared/checkpoint-advisory';
import { buildStartupReportForAssembly } from '../startup-report/assembly';
import { resolveStartupReportLevel } from '../startup-report/level';
import { bootstrapCacheLayout } from '../cache/cache-layout-bootstrap';
import {
	createJsonlRuntimeEventSink,
	runtimeEventsPath,
	runtimeSessionStarted,
} from '../observability/runtime-events';

const toolOwnerFromOrigin = (
	origin: 'bundled' | 'user-local' | 'external',
): ToolOwner => {
	switch (origin) {
		case 'bundled':
			return 'delendai';
		case 'external':
			return 'external-mcp';
		default:
			return 'host-project';
	}
};

const toolCategoryOf = (input: {
	readonly packageName: string;
	readonly tags?: readonly string[] | undefined;
	readonly effects?:
		| readonly ('write' | 'spawn' | 'network' | 'destructive')[]
		| undefined;
}): SafeToolCategory => {
	const tags = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()));
	const effects = new Set(input.effects ?? []);
	if (
		input.packageName === '@delendai/error-reporting' ||
		tags.has('reporting') ||
		tags.has('issues') ||
		tags.has('logs')
	) {
		return 'reporting';
	}
	if (
		tags.has('routing') ||
		tags.has('orchestration') ||
		tags.has('coordination') ||
		tags.has('agents')
	) {
		return 'orchestration';
	}
	if (tags.has('analysis') || tags.has('audit') || tags.has('search')) {
		return 'analysis';
	}
	if (
		input.packageName.includes('external-mcps') ||
		tags.has('external-mcps') ||
		tags.has('browser')
	) {
		return 'external-bridge';
	}
	if (effects.has('network')) return 'network';
	if (effects.has('spawn')) return 'process';
	if (effects.has('write')) return 'file';
	return 'unknown';
};

export interface IAssembledCliConfig {
	readonly config: IDelendaiHostConfig;
	/** Operator-only report; never sent through the MCP protocol. */
	readonly startupReport: import('../startup-report/model').IStartupReport;
	/** Rebuild the report after MCP registration exposes the real schemas. */
	readonly buildStartupReport: (
		schemaBytesByRegistrationId?: Readonly<Record<string, number>>,
	) => import('../startup-report/model').IStartupReport;
	readonly startupReportColor: 'auto' | 'always' | 'never';
	readonly loadResult: IPluginLoadResult;
	/** Config-file diagnostic from the SAME read used to assemble (so the
	 * doctor doesn't read the file twice). */
	readonly configDiagnostic: {
		readonly present: boolean;
		readonly issues: readonly string[];
	};
	/** Absolute path of the resolved config file. */
	readonly configPath: string;
	/**
	 * f00072 slice S1: the cache eviction registry handed to every
	 * plugin via `IMcpPluginContext.cacheEvictionRegistry`. Exposed
	 * here so the doctor and CLI tests can run / inspect it without
	 * spinning up a plugin. Last boot-sweep report (always dryRun by
	 * default — slice C turns this into an opt-in `apply`).
	 */
	readonly cacheEvictionRegistry: ICacheEvictionRegistry;
	readonly cacheEvictionBootReport: ICacheEvictionReport;
	/**
	 * The discovery catalog's tool entries, each carrying its fully-qualified
	 * callable `name` and its real owning `plugin` — the SAME authoritative
	 * values the `agent_catalog` tool and the `overview` snapshot expose.
	 * Surfaced so offline consumers (the static catalog generator, the web
	 * capabilities page) reuse this single source of truth instead of
	 * re-deriving the plugin by string-parsing the qualified name, which is
	 * unreliable for core tools whose id contains an underscore
	 * (`fs_read`, `agent_catalog`, …).
	 */
	readonly agentCatalogTools: readonly IToolSummary[];
	/** f00251 — the assembled error collector (always defined; ConsoleErrorSink fallback when no plugin registers a sink). */
	readonly errorCollector: IErrorCollector;
	/** Runtime evidence store under `<cacheDir>/evidence`. */
	readonly evidenceStore: IEvidenceStoreWithCleanup;
	readonly evidenceCleanupReport: ICacheEvictionReport;
}

export interface IAssembleCliDeps {
	/** Provide a custom file reader (default: node:fs.promises.readFile) */
	readFile?: (absolutePath: string) => Promise<string | undefined>;
	/** Provide a custom plugin module importer (default: dynamic import()) */
	import?: (specifier: string) => Promise<{ default: unknown }>;
	/**
	 * f00109 S1: existence probe for the workspace-layout diagnostic
	 * (default: node:fs.existsSync). Boot-time only, so sync is fine.
	 */
	exists?: (absolutePath: string) => boolean;
}

/**
 * Build the full host config from parsed CLI args: resolve the
 * workspace and core paths (CLI flag > config file > default), load
 * every `--plugins` entry passing each its `delendai.config.json`
 * options, merge the registrations, and always expose the core
 * meta-tools (scaffold + the hybrid analyze/create_project bootstrap).
 * Pure except for the injectable importer/reader, so it is fully
 * testable.
 */
export const assembleCliConfig = async (
	args: IDelendaiCliArgs,
	deps: IAssembleCliDeps = {},
): Promise<IAssembledCliConfig> => {
	const workspace = createWorkspacePathProvider(args.workspace);
	const readFile: (absolutePath: string) => Promise<string | undefined> =
		deps.readFile ??
		(async (absolutePath: string) => {
			try {
				return await readFileAsync(absolutePath, 'utf8');
			} catch (error) {
				if (
					error &&
					typeof error === 'object' &&
					'code' in error &&
					error.code === 'ENOENT'
				) {
					return undefined;
				}
				throw error;
			}
		});

	// Config file: --config, else `delendai.config.json` at the workspace.
	// Read the raw text ONCE and derive both the parsed config and the
	// diagnostic, so the doctor reuses this instead of re-reading.
	const configPath =
		args.configPath ?? join(args.workspace, DEFAULT_CONFIG_FILENAME);
	const rawConfig = await readFile(configPath);
	const fileConfig = parseConfigFile(rawConfig);
	const baseConfigDiagnostic = diagnoseConfigFile(rawConfig);
	// S1: layer the semantic plugin-path warnings on top of the
	// schema-only diagnostic. Schema validation can't catch the
	// "looks-like-a-bare-name" case (a bare string is still valid), so
	// we run a separate guard for every plugin entry that sets `path`.
	const pluginPathIssues = Object.entries(fileConfig.plugins ?? {}).flatMap(
		([name, entry]) => diagnosePluginPathConfig(entry ?? {}, name),
	);
	const configPluginNames = Object.keys(fileConfig.plugins ?? {});
	const disabledConfigPlugins = new Set(
		Object.entries(fileConfig.plugins ?? {})
			.filter(([, entry]) => entry.enabled === false)
			.map(([name]) => name),
	);

	// Precedence for roots: explicit CLI flag > config file > default.
	const cacheDir =
		args.tokens.cacheDir ??
		fileConfig.cacheDir ??
		DEFAULT_CORE_PATHS.cacheDir;
	const docsDir =
		args.tokens.docsDir ?? fileConfig.docsDir ?? DEFAULT_CORE_PATHS.docsDir;
	const corePaths = { cacheDir, docsDir };
	// S1: dead-config detection. A config file whose docsDir or
	// plugin `options.roots` point at paths that do not exist (the classic
	// copied-from-another-repo config) used to boot silently — every
	// plugin scanned an empty tree and the agent never found the docs,
	// rules or proposals layout. Probe each configured path once at boot
	// (sync is fine here) and fold the findings into the config
	// diagnostic, so the doctor, the boot stderr log and the overview all
	// surface the same issues.
	const exists = deps.exists ?? existsSync;
	const probeWorkspacePath = (relPath: string): WorkspacePathStatus => {
		const contained = resolveWorkspaceContained(workspace.root, relPath);
		if (!contained.ok) return 'escapes';
		return exists(contained.abs) ? 'exists' : 'missing';
	};
	const layoutIssues = diagnoseWorkspaceLayout({
		config: fileConfig,
		configPresent: baseConfigDiagnostic.present,
		docsDir,
		probe: probeWorkspacePath,
	});
	const docsDirMissing =
		baseConfigDiagnostic.present &&
		probeWorkspacePath(docsDir) !== 'exists';
	const configDiagnostic = {
		present: baseConfigDiagnostic.present,
		issues: [
			...baseConfigDiagnostic.issues,
			...pluginPathIssues,
			...layoutIssues,
		],
	};
	const corePrefix = args.namespacePrefix ?? 'delendai';
	const keepLegacy = fileConfig.keepLegacy ?? false;
	// U5: native authorized-roots filesystem allowlist. The config
	// lists absolute roots the operator authorizes for `fs_read`/`fs_write`
	// beyond the workspace; a relative entry is resolved against the
	// workspace root so the value handed to the containment helper is always
	// absolute. Default `[]` keeps the single-root behaviour unchanged.
	const fsAuthorizedRoots = (
		fileConfig.filesystem?.authorizedRoots ?? []
	).map((root) => resolve(workspace.root, root));
	// Host-scoped agent_worktree gate. Resolution order is host
	// CLI flag > config file > `false` default. The CLI value is already a
	// tri-state boolean (`undefined` when the flag is absent), so a simple
	// nullish cascade gives the documented precedence with a concrete
	// boolean result that is never `undefined`.
	const agentWorktreeEnabled =
		args.agentWorktree ?? fileConfig.agentWorktree ?? false;

	// slice S1: the cache eviction registry is a single shared
	// instance every plugin receives via its context. We create it
	// BEFORE loadPlugins so a plugin's `register()` can call
	// `ctx.cacheEvictionRegistry.register(rule)`. The boot sweep that
	// runs AFTER loadPlugins uses the same instance, so plugin rules
	// are picked up automatically. Default mode is `dryRun: true`
	// (matches the rest of the repo's "preview first" posture — slice
	// C introduces the opt-in `apply` mode from the config file).
	const cacheDirContained = resolveWorkspaceContained(
		workspace.root,
		cacheDir,
	);
	if (!cacheDirContained.ok) {
		// Should never happen — CLI flag > config > default are all
		// validated upstream — but a hard error here is better than
		// silently letting a rule with a bad cacheDir escape.
		throw new Error(
			`cacheDir escapes workspace: ${cacheDir} (${cacheDirContained.reason})`,
		);
	}
	const cacheEvictionRegistry = createCacheEvictionRegistry({
		workspaceRootAbs: workspace.root,
		cacheDirAbs: cacheDirContained.abs,
	});
	await bootstrapCacheLayout({
		workspaceRootAbs: workspace.root,
		cacheDirAbs: cacheDirContained.abs,
		createPluginDirs: false,
		legacyPaths:
			cacheDir !== DEFAULT_CORE_PATHS.cacheDir
				? [
						{
							sourceAbs: resolve(
								workspace.root,
								DEFAULT_CORE_PATHS.cacheDir,
							),
							destinationAbs: cacheDirContained.abs,
						},
					]
				: [],
	});
	const evidenceStore = createEvidenceStore({
		evidenceRootAbs: join(cacheDirContained.abs, 'evidence'),
		evictionRegistry: cacheEvictionRegistry,
		retentionDays: fileConfig.evidence?.retentionDays ?? 30,
	});
	// A server use always leaves the evidence root in place, even when no
	// optional report is enabled. This gives every host the same durable,
	// typed location without writing evidence into the repository.
	await evidenceStore.ensureLayout();

	// Peer-plugin registry: populated AFTER loadPlugins returns, so
	// handlers can lazily consult `ctx.peerPlugins.list()` and see the
	// final peer set. Created empty here; `peerPluginRegistrySet(...)`
	// is called once we know which plugins loaded successfully.
	const peerRegistry = createPeerPluginRegistry();
	const toolRegistryEntries = new Map<string, IToolRegistryEntry>();
	const toolRegistry: IToolIdentityRegistry = {
		get: (toolName) => toolRegistryEntries.get(toolName),
		list: () => new Map(toolRegistryEntries),
	};

	// Resolve the commit-author policy ONCE (the git lookup
	// runs at boot, not per commit). The CLI loader fills the identity
	// from MCP `clientInfo` (or `args.extra['agent-client']` / `agent-model`
	// — the only two places a programmatic host can inject it today
	// without plumbing a new channel); the named bits from the config
	// file. Defaults: mode `'git'`, clientName `'agent'`.
	// S3: the RAW host/model the host actually declared (config file
	// first, then the programmatic `agent-client`/`agent-model` args). Kept
	// separate from the sentinel-defaulted commit-author identity below so the
	// plugin-context `hostIdentity` is populated ONLY when a real identity was
	// provided — never the `'agent'`/`'unknown-model'` fallbacks.
	const providedHost =
		fileConfig.commitAuthor?.clientName ?? args.extra['agent-client'];
	const providedModel =
		fileConfig.commitAuthor?.modelName ?? args.extra['agent-model'];
	const hostIdentity: IResolvedHostIdentity | undefined =
		providedHost !== undefined || providedModel !== undefined
			? {
					...(providedHost !== undefined
						? { host: providedHost }
						: {}),
					...(providedModel !== undefined
						? { model: providedModel }
						: {}),
				}
			: undefined;

	const commitAuthorIdentity = {
		clientName: providedHost ?? 'agent',
		modelName: providedModel ?? 'unknown-model',
	};
	const commitAuthorNamed = {
		humanName: fileConfig.commitAuthor?.humanName ?? '',
		humanEmail: fileConfig.commitAuthor?.humanEmail ?? '',
	};
	const commitAuthorMode = fileConfig.commitAuthor?.mode ?? 'git';
	// `git` mode needs a live `git config` read; the others are pure
	// data. We always await the resolver so the result is a single
	// concrete value (success or `reason`) — callers never have to
	// re-resolve or branch on mode themselves.
	const commitAuthorResolution = await resolveCommitAuthor(
		{
			mode: commitAuthorMode,
			identity: commitAuthorIdentity,
			named: commitAuthorNamed,
		},
		createGitConfigReader(createGitRunner(workspace.root)),
	);

	// S2 — the sink every plugin's context receives. We
	// resolve it AFTER `assemblePlugins` (which sees the `logsSink`
	// each plugin returned in its registrations), and fall back to a
	// `ConsoleLogsSink` if no plugin supplied one. The fallback
	// guarantees no tool-call lifecycle event is silently dropped
	// when the host forgets `--plugins=logs`.
	let resolvedLogsSink: ILogsSink | undefined;
	// — collector assembled after `assemblePlugins` returns.
	let resolvedErrorCollector: IErrorCollector | undefined;
	// One dry-run-gated effects object, shared across every plugin's
	// context, built through the EffectBroker (r00037 S2/S3) — the
	// single point of construction for every mutating capability a
	// plugin context hands out. Safe to share a single instance — the
	// gate reads the AMBIENT dry-run scope of whichever tool call is
	// currently invoking it (see `dry-run-scope.helper.ts`), not any
	// state captured at construction time.
	const pluginEffects: IPluginEffectsCapability = createEffectBroker({
		git: {
			kind: 'git',
			perform: createGitRunner(workspace.root),
			describe: (args: readonly string[]) => args.join(' '),
		},
	});
	const buildContext = (
		pluginName: string,
		cacheNamespace?: string,
	): IMcpPluginContext => {
		const pluginConfig = pluginConfigFor(fileConfig, pluginName);
		const pluginOptions = new Map(
			Object.entries(fileConfig.plugins ?? {}).map(([name, config]) => [
				name,
				config.options ?? {},
			]),
		);
		const pluginCacheDir = joinRel(
			corePaths.cacheDir,
			cacheNamespace ? `${cacheNamespace}/${pluginName}` : pluginName,
		);
		const cachePath = (relativePath = ''): string => {
			const contained = resolveWorkspaceContained(
				workspace.root,
				join(pluginCacheDir, relativePath),
			);
			if (!contained.ok) {
				throw new Error(
					`plugin cache path escapes ${pluginCacheDir}: ${relativePath}`,
				);
			}
			return contained.abs;
		};
		return {
			workspace,
			corePaths,
			cacheDir: corePaths.cacheDir,
			docsDir: corePaths.docsDir,
			keepLegacy,
			agentWorktreeEnabled,
			commitAuthor: commitAuthorResolution,
			...(hostIdentity !== undefined ? { hostIdentity } : {}),
			pluginCacheDir,
			cachePath,
			pluginDocsDir: joinRel(corePaths.docsDir, pluginName),
			namespacePrefix: `${corePrefix}_${pluginConfig.prefix ?? pluginName}`,
			options: pluginConfig.options ?? {},
			pluginOptions,
			args: args.extra,
			cacheEvictionRegistry,
			peerPlugins: peerRegistry.registry,
			toolRegistry,
			effects: pluginEffects,
			...(resolvedLogsSink !== undefined
				? { logsSink: resolvedLogsSink }
				: {}),
			...(resolvedErrorCollector !== undefined
				? { errorCollector: resolvedErrorCollector }
				: {}),
		};
	};

	const {
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
		logsSink,
		errorSinks,
		activationReport,
		toolSurfaceDescriptors,
		configurationPlugins,
		configurationArtifacts,
		pluginSummaries,
		lazyToolActivators,
		moduleLoading,
		surfacePluginNames,
		lazyPluginPackages,
		lazyPluginActivators,
		consumeLazyPluginRegistrations,
		disposePlugins,
		disposePlugin,
	} = await assemblePlugins({
		args,
		fileConfig,
		corePrefix,
		configPluginNames,
		disabledConfigPlugins,
		buildContext,
		peerRegistry,
		...(deps.import !== undefined ? { importFn: deps.import } : {}),
	});
	const cacheReconcile = (apply: boolean) =>
		bootstrapCacheLayout({
			workspaceRootAbs: workspace.root,
			cacheDirAbs: cacheDirContained.abs,
			apply,
			legacyPaths: loadResult.loaded.flatMap(({ plugin }) => {
				const target = joinRel(
					corePaths.cacheDir,
					plugin.cacheNamespace
						? `${plugin.cacheNamespace}/${plugin.name}`
						: plugin.name,
				);
				return [
					...(cacheDir !== DEFAULT_CORE_PATHS.cacheDir
						? [
								{
									sourceAbs: resolve(
										workspace.root,
										joinRel(
											DEFAULT_CORE_PATHS.cacheDir,
											plugin.cacheNamespace
												? `${plugin.cacheNamespace}/${plugin.name}`
												: plugin.name,
										),
									),
									destinationAbs: resolve(
										workspace.root,
										target,
									),
								},
								{
									sourceAbs: resolve(
										workspace.root,
										`.${plugin.name}`,
									),
									destinationAbs: resolve(
										workspace.root,
										target,
									),
								},
							]
						: []),
				];
			}),
			createPluginDirs: false,
		});
	await bootstrapCacheLayout({
		workspaceRootAbs: workspace.root,
		cacheDirAbs: cacheDirContained.abs,
		createPluginDirs: false,
	});

	const {
		validationMatrix,
		skillCatalog,
		skillSummaries,
		proposalSummaries,
		recommendedNextAction,
	} = await assembleSkills({
		args,
		fileConfig,
		docsDir,
		cacheDir,
		corePrefix,
		docsDirMissing,
		configPresent: baseConfigDiagnostic.present,
		readFile,
		loadResult,
		configurationArtifacts,
		...(lazyPluginPackages !== undefined
			? { portablePluginPackages: lazyPluginPackages }
			: {}),
	});

	const toolSurfaceRuntime = createToolSurfaceRuntimeAccess();
	const explicitSurfaceMode = resolveExplicitSurfaceMode({
		cliMode: args.surfaceMode,
		cliSurfaceExplicit: args.tokens.surface !== undefined,
		configMode: fileConfig.surfaceMode,
	});
	const initialSurfaceMode = resolveInitialSurfaceMode(explicitSurfaceMode);
	const {
		tools,
		catalogToolEntries,
		metricsRegistry,
		configurationSnapshot,
	} = await assembleCoreTools({
		args,
		corePrefix,
		corePaths,
		workspace,
		fileConfig,
		configDiagnostic,
		configPluginNames,
		effectivePlugins,
		activationReport,
		loadResult,
		pluginSummaries,
		moduleLoading,
		pluginToolEntries,
		qualifiedPluginTools,
		knowledge,
		skillSummaries,
		skillCatalog,
		proposalSummaries,
		validationMatrix,
		recommendedNextAction,
		configurationPlugins,
		configurationArtifacts,
		fsAuthorizedRoots,
		keepLegacy,
		toolSurfaceRuntime,
		prompts,
		resources,
		cacheReconcile,
	});
	const runtimeEventSink = createJsonlRuntimeEventSink(
		runtimeEventsPath(cacheDirContained.abs),
	);
	runtimeSessionStarted(runtimeEventSink, {
		mode: initialSurfaceMode,
		workspace: workspace.root,
	});
	const coreSurfaceDescriptors: IToolSurfaceDescriptor[] = tools
		.filter(
			(registration) =>
				!toolSurfaceDescriptors.some(
					(entry) => entry.registrationId === registration.id,
				),
		)
		.map((registration) => ({
			registrationId: registration.id,
			name: `${corePrefix}_${registration.id}`,
			toolId: registration.id,
			...(registration.summary !== undefined
				? { summary: registration.summary }
				: {}),
			...(registration.tags !== undefined
				? { tags: registration.tags }
				: {}),
		}));
	const pluginDescriptorsByRegistrationId = new Map(
		toolSurfaceDescriptors.map(
			(entry) => [entry.registrationId, entry] as const,
		),
	);
	for (const registration of tools) {
		const descriptor = pluginDescriptorsByRegistrationId.get(
			registration.id,
		);
		if (descriptor?.pluginId !== undefined) {
			const loadedPlugin = loadResult.loaded.find(
				(entry) => entry.plugin.name === descriptor.pluginId,
			);
			const pluginConfig = pluginConfigFor(
				fileConfig,
				descriptor.pluginId,
			);
			const origin = classifyOrigin({
				name: descriptor.pluginId,
				resolvedSpecifier:
					loadedPlugin?.resolved ?? descriptor.pluginId,
				hasExplicitPath:
					typeof pluginConfig.path === 'string' &&
					pluginConfig.path !== '',
				isExternalServer: descriptor.pluginId.startsWith('ext.'),
			});
			const packageName = loadedPlugin?.resolved ?? descriptor.pluginId;
			toolRegistryEntries.set(descriptor.name, {
				packageName,
				owner: toolOwnerFromOrigin(origin),
				...(origin === 'bundled'
					? { publicToolName: descriptor.toolId }
					: {}),
				category: toolCategoryOf({
					packageName,
					tags: registration.tags,
					effects: registration.effects,
				}),
			});
			continue;
		}

		toolRegistryEntries.set(`${corePrefix}_${registration.id}`, {
			packageName: '@delendai/core',
			owner: 'delendai',
			publicToolName: registration.id,
			category: toolCategoryOf({
				packageName: '@delendai/core',
				tags: registration.tags,
				effects: registration.effects,
			}),
		});
	}
	// Lazy plugin tools are catalogued before any plugin module is imported.
	// Give the same identity registry coverage to those hidden routes so
	// permission/category consumers do not mistake "not loaded" for "unknown".
	for (const descriptor of toolSurfaceDescriptors) {
		if (
			descriptor.pluginId === undefined ||
			toolRegistryEntries.has(descriptor.name)
		)
			continue;
		const packageName = `@delendai/${descriptor.pluginId}`;
		toolRegistryEntries.set(descriptor.name, {
			packageName,
			owner: 'delendai',
			publicToolName: descriptor.toolId,
			category: toolCategoryOf({
				packageName,
				tags: descriptor.tags,
			}),
		});
	}
	const pluginDescriptorsByPlugin = new Map<
		string,
		{
			namespace: string;
			toolRegistrationIds: string[];
			describe?: string | undefined;
		}
	>();
	// Keep plugins that only contribute prompts, resources, knowledge, or
	// skills in the surface index too. They have no tool descriptor to seed
	// this map, but `plugin_activate` still needs to resolve their id so a
	// lazy module can reconnect those non-tool registrations on demand.
	for (const plugin of configurationPlugins) {
		pluginDescriptorsByPlugin.set(plugin.id, {
			namespace: plugin.prefix ?? plugin.id,
			toolRegistrationIds: [],
			describe: pluginSummaries.find(
				(summary) => summary.name === plugin.id,
			)?.describe,
		});
	}
	for (const entry of toolSurfaceDescriptors) {
		if (entry.pluginId === undefined || entry.namespace === undefined)
			continue;
		const existing = pluginDescriptorsByPlugin.get(entry.pluginId) ?? {
			namespace: entry.namespace,
			toolRegistrationIds: [],
			describe: loadResult.loaded.find(
				(candidate) => candidate.plugin.name === entry.pluginId,
			)?.plugin.describe,
		};
		existing.toolRegistrationIds.push(entry.registrationId);
		pluginDescriptorsByPlugin.set(entry.pluginId, existing);
	}
	const toolSurfacePlan: IToolSurfacePlan = {
		mode: initialSurfaceMode,
		...(explicitSurfaceMode !== undefined
			? { explicitMode: explicitSurfaceMode }
			: {}),
		bootstrapToolIds: [...BOOTSTRAP_CORE_TOOL_IDS],
		...(fileConfig.managedSurface?.progressiveDisclosure === true
			? { progressiveDisclosure: true }
			: {}),
		// The vertex router is ALWAYS registered as a tool
		// (see assemble-core-tools.ts) and the plan records its id so
		// the runtime can hide it in `native` mode (the operator has
		// every tool listed) and expose it in `managed`/`adaptive`/`compact`
		// mode as the fallback entry point for tools outside the
		// bootstrap set.
		routerToolId: 'vertex',
		workingSet: {
			idleTtlMs:
				fileConfig.managedSurface?.idleTtlMs !== undefined
					? fileConfig.managedSurface.idleTtlMs
					: 5 * 60_000,
			maxWarmPlugins:
				fileConfig.managedSurface?.maxWarmPlugins !== undefined
					? fileConfig.managedSurface.maxWarmPlugins
					: 8,
		},
		descriptors: [...coreSurfaceDescriptors, ...toolSurfaceDescriptors],
		plugins: [...pluginDescriptorsByPlugin.entries()].map(
			([id, entry]) => ({
				id,
				namespace: entry.namespace,
				toolRegistrationIds: entry.toolRegistrationIds,
				...(entry.describe !== undefined
					? { describe: entry.describe }
					: {}),
			}),
		),
	};

	const emitHookError = async (info: {
		readonly pluginName: string;
		readonly resolvedSpecifier: string;
		readonly hookName: import('../contracts/interfaces/plugin-lifecycle-error.interface').PluginHookName;
		readonly toolName: string;
		readonly args: unknown;
		readonly error: unknown;
		readonly elapsedMs?: number;
	}): Promise<void> => {
		for (const observer of onHookErrors) {
			try {
				await observer.handler(info);
			} catch (hookError) {
				process.stderr.write(
					`[delendai] onHookError error (${observer.pluginName}): ${hookError instanceof Error ? hookError.message : String(hookError)}\n`,
				);
			}
		}
	};

	const config: IDelendaiHostConfig = {
		metadata: {
			name: args.serverName,
			version: args.serverVersion,
			description: 'delendai server (CLI plugin loader).',
		},
		namespacePrefix: corePrefix,
		workspace,
		corePaths,
		keepLegacy,
		agentWorktreeEnabled,
		validationMatrix,
		knowledge,
		metricsRegistry,
		runtimeEventSink,
		extraTools: tools,
		extraPrompts: prompts,
		extraResources: resources,
		toolSurfacePlan,
		toolSurfaceRuntime,
		disposePlugins,
		...(disposePlugin !== undefined ? { disposePlugin } : {}),
		...(lazyToolActivators !== undefined ? { lazyToolActivators } : {}),
		...(lazyPluginActivators !== undefined ? { lazyPluginActivators } : {}),
		...(consumeLazyPluginRegistrations !== undefined
			? { consumeLazyPluginRegistrations }
			: {}),
		...(moduleLoading === 'lazy' || onToolStarts.length > 0
			? {
					onToolStart: async (toolName, toolArgs) => {
						for (const observer of onToolStarts) {
							try {
								await observer.handler(toolName, toolArgs);
							} catch (e) {
								process.stderr.write(
									`[delendai] onToolStart error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
								await emitHookError({
									pluginName: observer.pluginName,
									resolvedSpecifier:
										observer.resolvedSpecifier,
									hookName: 'onToolStart',
									toolName,
									args: toolArgs,
									error: e,
								});
							}
						}
					},
				}
			: {}),
		...(moduleLoading === 'lazy' ||
		onToolCancels.length > 0 ||
		resolvedLogsSink !== undefined
			? {
					onToolCancel: async (
						toolName,
						toolArgs,
						elapsedMs,
						context,
					) => {
						const cancellation = context ?? {
							reason: 'tool invocation aborted',
							nextAction:
								'Retry the operation or resume from the latest persisted checkpoint.',
							error: new Error('tool invocation aborted'),
						};
						if (resolvedLogsSink !== undefined) {
							try {
								await resolvedLogsSink.record({
									ts: new Date().toISOString(),
									kind: 'tool-cancelled',
									outcome: 'cancelled',
									severity: 'notice',
									incidentType: 'tool-cancelled',
									toolName,
									taskId: null,
									agent: null,
									summary: `tool-cancelled: ${toolName}: ${cancellation.reason}`,
									meta: {
										reason: cancellation.reason,
										nextAction: cancellation.nextAction,
										elapsedMs,
										error: String(cancellation.error),
										args: toolArgs,
									},
								});
							} catch (e) {
								process.stderr.write(
									`[delendai] cancellation log error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
							}
						}
						for (const observer of onToolCancels) {
							try {
								await observer.handler(
									toolName,
									toolArgs,
									elapsedMs,
									cancellation,
								);
							} catch (e) {
								process.stderr.write(
									`[delendai] onToolCancel error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
								await emitHookError({
									pluginName: observer.pluginName,
									resolvedSpecifier:
										observer.resolvedSpecifier,
									hookName: 'onToolCancel',
									toolName,
									args: toolArgs,
									error: e,
									elapsedMs,
								});
							}
						}
					},
				}
			: {}),
		...(moduleLoading === 'lazy' || onToolCalls.length > 0
			? {
					onToolCall: async (
						toolName,
						toolArgs,
						result,
						error,
						elapsedMs,
					) => {
						for (const observer of onToolCalls) {
							try {
								await observer.handler(
									toolName,
									toolArgs,
									result,
									error,
									elapsedMs,
								);
							} catch (e) {
								process.stderr.write(
									`[delendai] onToolCall error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
								await emitHookError({
									pluginName: observer.pluginName,
									resolvedSpecifier:
										observer.resolvedSpecifier,
									hookName: 'onToolCall',
									toolName,
									args: toolArgs,
									error: e,
									...(elapsedMs !== undefined
										? { elapsedMs }
										: {}),
								});
							}
						}
					},
				}
			: {}),
		...(moduleLoading === 'lazy' || isAgentStuckFn !== undefined
			? {
					isAgentStuck: (toolName, toolArgs) =>
						isAgentStuckFn?.(toolName, toolArgs) ?? null,
				}
			: {}),
		...(moduleLoading === 'lazy' || getCheckpointAdvisoryFns.length > 0
			? {
					getCheckpointAdvisory: (context) =>
						selectCheckpointAdvisory(
							getCheckpointAdvisoryFns.map((fn) => fn(context)),
						),
				}
			: {}),
		...(moduleLoading === 'lazy' || beforeToolCallFns.length > 0
			? {
					beforeToolCall: (context) =>
						mergeCheckpointAdvisories(
							beforeToolCallFns.map((fn) => fn(context)),
						),
				}
			: {}),
	};

	// S2 — if no plugin supplied a sink, default to the
	// console fallback so lifecycle events still surface (one
	// structured JSON line per event on stderr, redacted).
	resolvedLogsSink =
		logsSink ??
		new ConsoleLogsSink({
			quiet: (args as { quiet?: boolean }).quiet === true,
		});

	// Build the error collector once; inject ConsoleErrorSink fallback when
	// no plugin registered a sink so every tool invocation has a capture target.
	const effectiveErrorSinks: readonly IErrorSink[] =
		errorSinks.length > 0
			? errorSinks
			: [
					new ConsoleErrorSink({
						quiet: (args as { quiet?: boolean }).quiet === true,
					}),
				];
	const errorCollector = createErrorCollector({
		sinks: effectiveErrorSinks,
		classifier: createDefaultSeverityClassifier(),
		redaction: createDefaultRedactionPolicy(),
	});
	resolvedErrorCollector = errorCollector;

	const startupLevel = resolveStartupReportLevel({
		configLevel: fileConfig.startupReport?.level,
		cliLevel: args.startupReportLevel,
	});
	const skillsByPlugin = Object.fromEntries(
		['core', ...effectivePlugins].map((pluginId) => [
			pluginId,
			skillSummaries
				.filter((skill) =>
					skill.appliesTo.some(
						(owner) =>
							owner === '@delendai/*' ||
							owner === `@delendai/${pluginId}`,
					),
				)
				.map((skill) => skill.id),
		]),
	);
	// A configured `plugins.<id>.path` contributes the RAW PATH as an id in
	// `effectivePlugins`, but `loadResult.loaded` carries the resolved plugin
	// NAME (`IMcpPlugin.name`). Comparing the two directly made the startup
	// report mark every path-mounted plugin as 'failed' even when it loaded
	// fine ('unavailable (1): <path>' in the boot summary while every one of
	// its tools worked). Canonicalize: a configured id that successfully
	// loaded contributes the name it resolved to; only ids with no loaded
	// plugin behind them keep their original form so genuine failures still
	// show up.
	const loadedNames = new Set(loadResult.loaded.map((e) => e.plugin.name));
	const configuredPluginIds = effectivePlugins.map((pluginId) => {
		if (loadedNames.has(pluginId)) return pluginId;
		const loadedBySpecifier = loadResult.loaded.find(
			(entry) => entry.specifier === pluginId,
		);
		return loadedBySpecifier?.plugin.name ?? pluginId;
	});
	const buildStartupReport = (
		schemaBytesByRegistrationId?: Readonly<Record<string, number>>,
	) =>
		buildStartupReportForAssembly({
			plan: toolSurfacePlan,
			level: startupLevel.level,
			version: args.serverVersion,
			workspace: args.workspace,
			preset: args.tokens.preset ?? 'custom',
			configuredPluginIds: configuredPluginIds,
			loadedPluginIds: loadResult.loaded.map(
				(entry) => entry.plugin.name,
			),
			skillsByPlugin,
			failedPluginCount: loadResult.errors.length,
			skillsAvailable: skillSummaries.length,
			resourcesAvailable:
				resources.length +
				(moduleLoading === 'lazy'
					? configurationPlugins.reduce(
							(total, plugin) =>
								total + plugin.capabilities.resources,
							0,
						)
					: 0),
			moduleLoading,
			...(schemaBytesByRegistrationId !== undefined
				? { schemaBytesByRegistrationId }
				: {}),
			warnings: [
				...configDiagnostic.issues.map((message) => ({
					severity: 'warning' as const,
					code: 'config',
					message,
				})),
				...(startupLevel.requested !== undefined
					? [
							{
								severity: 'warning' as const,
								code: 'startup-report-level',
								message: `Unknown startup report level "${startupLevel.requested}"; using ${startupLevel.level}.`,
							},
						]
					: []),
			],
			diagnostics: {
				configuration: configurationSnapshot,
			},
		});
	const startupReport = buildStartupReport();
	// Runtime evidence is cache data, not repository output. Keep the surface
	// and skill snapshots compact: they make the typed evidence directories
	// useful to operators without persisting tool schemas or skill bodies.
	await evidenceStore.write('surface', {
		mode: startupReport.identity.surfaceMode,
		availableTools: startupReport.catalog.toolsAvailable,
		exposedTools: startupReport.catalog.toolsExposed,
		exposedSchemaBytesPerRequest:
			startupReport.reconciliation.exposedSchemaBytesPerRequest,
		nativeEquivalentTokensPerRequest:
			startupReport.reconciliation.nativeEquivalentTokensPerRequest,
		avoidedTokensPerRequest:
			startupReport.reconciliation.avoidedTokensPerRequest,
	});
	await evidenceStore.write('skills', {
		available: startupReport.catalog.skillsAvailable,
		bodiesPreloaded: startupReport.catalog.skillsBodiesPreloaded,
		byPlugin: skillsByPlugin,
	});
	if (startupReport.warnings.length > 0) {
		await evidenceStore.write('diagnostic', {
			warnings: startupReport.warnings.map(
				({ code, message, severity }) => ({
					code,
					message,
					severity,
				}),
			),
		});
	}

	// slice S1/S3: boot sweep. Runs once, AFTER every plugin has
	// registered its rules. The result is surfaced in
	// `IAssembledCliConfig.cacheEvictionBootReport` so the doctor
	// (and CLI tests) can assert what the sweep would have done.
	//
	// Posture is governed by `config.cache.runOnBoot` (f00072 S3),
	// defaulting to `'dry-run'` (safe: deletes nothing, only logs the
	// report). The destructive `'apply'` mode is honoured ONLY when the
	// opt-in `cache` plugin is loaded — without it no plugin contributes
	// the static rules and a stray `apply` config would be a no-op
	// anyway, but gating on the plugin keeps the core agnostic: a host
	// that never loads `cache` can never trigger deletion. `'off'` skips
	// the sweep entirely (empty report).
	const cacheRunOnBoot = fileConfig.cache?.runOnBoot ?? 'dry-run';
	// Ask the surface, not `loaded`: under the managed-lazy route nothing
	// is imported until it is called, so `loaded` is empty and this gate
	// read `false` for every adopter on the default surface — silently
	// turning a configured `apply` posture into a no-op. The plugin is
	// startup-activated when a sweep is configured
	// (`requiresBootSweepActivation`), so its rules are registered by the
	// time the sweep runs.
	const cachePluginLoaded = surfacePluginNames.includes('cache');
	const cacheEvictionApply = cacheRunOnBoot === 'apply' && cachePluginLoaded;
	const cacheEvictionBootReport: ICacheEvictionReport =
		cacheRunOnBoot === 'off'
			? {
					dryRun: true,
					appliedAt: new Date().toISOString(),
					totalBytes: 0,
					removed: [],
					skipped: [],
					errors: [],
					rulesEvaluated: 0,
				}
			: await cacheEvictionRegistry.run({ dryRun: !cacheEvictionApply });
	const evidenceCleanupReport = await evidenceStore.cleanup(
		fileConfig.evidence?.cleanup ?? 'on-boot',
	);

	return {
		config,
		startupReport,
		buildStartupReport,
		startupReportColor: fileConfig.startupReport?.color ?? 'auto',
		loadResult,
		configDiagnostic,
		configPath,
		cacheEvictionRegistry,
		cacheEvictionBootReport,
		agentCatalogTools: catalogToolEntries,
		errorCollector,
		evidenceStore,
		evidenceCleanupReport,
	};
};
