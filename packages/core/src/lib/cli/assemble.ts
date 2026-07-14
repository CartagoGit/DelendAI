import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IResolvedHostIdentity } from '../contracts/interfaces/resolved-host-identity.interface';
import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import {
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	diagnosePluginPathConfig,
	parseConfigFile,
	pluginConfigFor,
	resolveConfigPluginSpecifiers,
} from '../plugins/load-config-file';
import { diagnoseWorkspaceLayout } from '../plugins/diagnose-workspace-layout';
import type { WorkspacePathStatus } from '../contracts/interfaces/workspace-layout.interface';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpPluginContext } from '../plugins/plugin-contract';
import { createPeerPluginRegistry } from '../plugins/peer-plugin-registry';
import type { IMcpVertexCliArgs } from '../plugins/parse-cli-args';
import { createMcpProject } from '../project/create-mcp-project';
import { joinRel } from '../shared/paths';
import {
	createGitConfigReader,
	resolveCommitAuthor,
} from '../shared/commit-author';
import { createGitRunner } from '../shared/git-write';
import type {
	ISkillSummary,
	IToolSummary,
} from '../catalog/agent-discovery-types';
import { createWorkspacePathProvider } from '../workspace/create-workspace-path-provider';
import type {
	ICacheEvictionReport,
	ICacheEvictionRegistry,
} from '../contracts/interfaces/cache-eviction.interface';
import { createCacheEvictionRegistry } from '../cache/eviction-registry';
import { resolveWorkspaceContained } from '../shared/contain-path';
import type {
	IConfigurationArtifact,
	IConfigurationPlugin,
} from '../contracts/interfaces/configuration-center.interface';
import { assemblePlugins } from './assemble-plugins';
import { assembleCoreTools } from './assemble-core-tools';
import { assembleSkills } from './assemble-skills';

export interface IAssembledCliConfig {
	readonly config: IMcpVertexHostConfig;
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
 * every `--plugins` entry passing each its `mcp-vertex.config.json`
 * options, merge the registrations, and always expose the core
 * meta-tools (scaffold + the hybrid analyze/create_project bootstrap).
 * Pure except for the injectable importer/reader, so it is fully
 * testable.
 */
export const assembleCliConfig = async (
	args: IMcpVertexCliArgs,
	deps: IAssembleCliDeps = {},
): Promise<IAssembledCliConfig> => {
	const workspace = createWorkspacePathProvider(args.workspace);
	const readFile: (absolutePath: string) => Promise<string | undefined> =
		deps.readFile ??
		(async (absolutePath: string) =>
			existsSync(absolutePath)
				? readFileSync(absolutePath, 'utf8')
				: undefined);

	// Config file: --config, else `mcp-vertex.config.json` at the workspace.
	// Read the raw text ONCE and derive both the parsed config and the
	// diagnostic, so the doctor reuses this instead of re-reading.
	const configPath =
		args.configPath ?? join(args.workspace, DEFAULT_CONFIG_FILENAME);
	const rawConfig = await readFile(configPath);
	const fileConfig = parseConfigFile(rawConfig);
	const baseConfigDiagnostic = diagnoseConfigFile(rawConfig);
	// f00087 S1: layer the semantic plugin-path warnings on top of the
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
	// f00109 S1: dead-config detection. A config file whose docsDir or
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
	const corePrefix = args.namespacePrefix ?? 'mcp-vertex';
	const keepLegacy = fileConfig.keepLegacy ?? false;
	// f00089 U5: native authorized-roots filesystem allowlist. The config
	// lists absolute roots the operator authorizes for `fs_read`/`fs_write`
	// beyond the workspace; a relative entry is resolved against the
	// workspace root so the value handed to the containment helper is always
	// absolute. Default `[]` keeps the single-root behaviour unchanged.
	const fsAuthorizedRoots = (
		fileConfig.filesystem?.authorizedRoots ?? []
	).map((root) => resolve(workspace.root, root));
	// f00052: host-scoped agent_worktree gate. Resolution order is host
	// CLI flag > config file > `false` default. The CLI value is already a
	// tri-state boolean (`undefined` when the flag is absent), so a simple
	// nullish cascade gives the documented precedence with a concrete
	// boolean result that is never `undefined`.
	const agentWorktreeEnabled =
		args.agentWorktree ?? fileConfig.agentWorktree ?? false;

	// f00072 slice S1: the cache eviction registry is a single shared
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

	// Peer-plugin registry: populated AFTER loadPlugins returns, so
	// handlers can lazily consult `ctx.peerPlugins.list()` and see the
	// final peer set. Created empty here; `peerPluginRegistrySet(...)`
	// is called once we know which plugins loaded successfully.
	const peerRegistry = createPeerPluginRegistry();

	// f00082: resolve the commit-author policy ONCE (the git lookup
	// runs at boot, not per commit). The CLI loader fills the identity
	// from MCP `clientInfo` (or `args.extra['agent-client']` / `agent-model`
	// — the only two places a programmatic host can inject it today
	// without plumbing a new channel); the named bits from the config
	// file. Defaults: mode `'git'`, clientName `'agent'`.
	// f00082 S3: the RAW host/model the host actually declared (config file
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

	const buildContext = (pluginName: string): IMcpPluginContext => {
		const pluginConfig = pluginConfigFor(fileConfig, pluginName);
		return {
			workspace,
			corePaths,
			cacheDir: corePaths.cacheDir,
			docsDir: corePaths.docsDir,
			keepLegacy,
			agentWorktreeEnabled,
			commitAuthor: commitAuthorResolution,
			...(hostIdentity !== undefined ? { hostIdentity } : {}),
			pluginCacheDir: joinRel(corePaths.cacheDir, pluginName),
			pluginDocsDir: joinRel(corePaths.docsDir, pluginName),
			namespacePrefix: `${corePrefix}_${pluginConfig.prefix ?? pluginName}`,
			options: pluginConfig.options ?? {},
			args: args.extra,
			cacheEvictionRegistry,
			peerPlugins: peerRegistry.registry,
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
		isAgentStuckFn,
		activationReport,
		activationById,
		configurationPlugins,
		configurationArtifacts,
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

	const {
		validationMatrix,
		skillBundles,
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
		readFile,
		loadResult,
		configurationArtifacts,
	});

	const { tools, catalogToolEntries, metricsRegistry } = assembleCoreTools({
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
		prompts,
		resources,
	});

	const config: IMcpVertexHostConfig = {
		metadata: {
			name: args.serverName,
			version: args.serverVersion,
			description: 'mcp-vertex server (CLI plugin loader).',
		},
		namespacePrefix: corePrefix,
		workspace,
		corePaths,
		keepLegacy,
		agentWorktreeEnabled,
		validationMatrix,
		knowledge,
		metricsRegistry,
		extraTools: tools,
		extraPrompts: prompts,
		extraResources: resources,
		...(onToolStarts.length > 0
			? {
					onToolStart: async (toolName, toolArgs) => {
						for (const handler of onToolStarts) {
							try {
								await handler(toolName, toolArgs);
							} catch (e) {
								process.stderr.write(
									`[mcp-vertex] onToolStart error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
							}
						}
					},
				}
			: {}),
		...(onToolCancels.length > 0
			? {
					onToolCancel: async (toolName, toolArgs, elapsedMs) => {
						for (const handler of onToolCancels) {
							try {
								await handler(toolName, toolArgs, elapsedMs);
							} catch (e) {
								process.stderr.write(
									`[mcp-vertex] onToolCancel error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
							}
						}
					},
				}
			: {}),
		...(onToolCalls.length > 0
			? {
					onToolCall: async (toolName, toolArgs, result, error) => {
						for (const handler of onToolCalls) {
							try {
								await handler(
									toolName,
									toolArgs,
									result,
									error,
								);
							} catch (e) {
								process.stderr.write(
									`[mcp-vertex] onToolCall error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
							}
						}
					},
				}
			: {}),
		...(isAgentStuckFn !== undefined
			? { isAgentStuck: isAgentStuckFn }
			: {}),
	};

	// f00072 slice S1/S3: boot sweep. Runs once, AFTER every plugin has
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
	const cachePluginLoaded = loadResult.loaded.some(
		(entry) => entry.plugin.name === 'cache',
	);
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

	return {
		config,
		loadResult,
		configDiagnostic,
		configPath,
		cacheEvictionRegistry,
		cacheEvictionBootReport,
		agentCatalogTools: catalogToolEntries,
	};
};
