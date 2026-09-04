import type { IProviderCapabilities } from '../contracts/interfaces/provider-capabilities.interface';
import type { PluginOrigin } from '../contracts/interfaces/plugin-origin.interface';
import type { CommitAuthorMode } from '../contracts/interfaces/commit-author.interface';
import type { IMcpToolSurfaceMode } from '../contracts/interfaces/surface-mode.interface';
import type { IStartupReportLevelInput } from '../startup-report/level';
import { CONFIG_FILE_SCHEMA } from './config-file-schema';

/**
 * Solid-ISP: each concern of the config file lives in its own
 * sub-interface so callers depend only on what they need. A consumer
 * that just wants the core paths (cacheDir/docsDir) does NOT have to
 * import the loop detector config type, the bootstrap overrides, etc.
 *
 * The composite `IDelendaiConfigFile` is the union of every sub-
 * interface — it stays exported as a single type for callers that
 * really do want everything (e.g. the parser / doctor).
 */

/** Quality-gate commands per scope, surfaced by `get_validation_matrix`. */
export interface IValidationMatrixScope {
	readonly command: string;
	readonly expect: string;
}

export interface IValidationMatrixConfig {
	readonly scopes: Readonly<
		Record<string, ReadonlyArray<IValidationMatrixScope>>
	>;
}

/** Solid-ISP: a single bootstrap pattern override entry. */
export interface IBootstrapPatternOverride {
	readonly type: string;
	readonly describe: string;
	readonly recommendedTools: ReadonlyArray<{
		readonly name: string;
		readonly description: string;
	}>;
	readonly recommendedPlugins: readonly string[];
	readonly knowledgeHints: readonly string[];
}

/** Solid-ISP: all host-supplied bootstrap pattern overrides, keyed by name. */
export interface IBootstrapPatternOverrides {
	readonly patternOverrides?: Readonly<
		Record<string, IBootstrapPatternOverride>
	>;
}

/**
 * Solid-ISP: the core paths + scaffold-preservation toggle. Every host
 * reads at least these. Consumers that only need the paths can
 * depend on this and ignore the rest.
 */
export interface IDelendaiCorePathsConfig {
	readonly cacheDir?: string;
	readonly docsDir?: string;
	/**
	 * Default false. When true, scaffold regeneration preserves existing
	 * files under legacy/ before writing fresh templates.
	 */
	readonly keepLegacy?: boolean;
}

/** Operator-only startup diagnostics. Defaults are resolved centrally. */
export interface IStartupReportConfig {
	readonly level?: IStartupReportLevelInput;
	readonly color?: 'auto' | 'always' | 'never';
}

/** Managed-surface working-set policy. Null disables that bound. */
export interface IManagedSurfaceConfig {
	/** Module strategy for managed plugins. Defaults to lazy; use eager for compatibility. */
	readonly loading?: 'lazy' | 'eager';
	readonly idleTtlMs?: number | null;
	readonly maxWarmPlugins?: number | null;
	/**
	 * Let `native` mode honour per-tool `disclosure` levels (q00016 S8).
	 *
	 * Off by default, and that default is the decision, not an oversight.
	 * `native` is chosen explicitly by a host whose promise is "every tool
	 * up front, no discovery round-trip"; such a host may never call the
	 * router, and the MCP SDK has no state for "unlisted but callable" —
	 * `disable()` refuses invocation too. Turning this on unconditionally
	 * took six read-only `proposals` tools off `tools/list` AND made a
	 * direct call to them fail with `-32602 ... disabled`.
	 *
	 * Turn it on when the host does use the router and wants the smaller
	 * surface: `proposals` alone drops from ~51 KB to the essential flow.
	 */
	readonly progressiveDisclosure?: boolean;
}

/** Runtime evidence retention and boot cleanup policy. */
export interface IEvidenceConfig {
	/** Number of days to retain evidence files. Default 30. */
	readonly retentionDays?: number;
	/** Default on-boot cleanup; dry-run reports without deleting. */
	readonly cleanup?: 'on-boot' | 'dry-run' | 'off';
}

/**
 * Solid-ISP: f00089 U5 — native default filesystem configuration.
 *
 * `authorizedRoots` lists absolute roots the operator has explicitly
 * authorized for the native `fs_read` / `fs_write` tools, in addition
 * to the workspace root. A path (relative or absolute) is allowed when
 * it falls inside the workspace root OR inside one of these roots.
 *
 * Default `[]` (or omitted): the native fs tools keep their single-root,
 * reject-absolute behaviour — every user already reads their own project;
 * external paths stay off until explicitly authorized here. Because the
 * list lives in the committed `delendai.config.json`, authorization is
 * durable and reviewable, never LLM-expanded.
 */
export interface IFilesystemConfig {
	readonly authorizedRoots?: readonly string[];
}

/**
 * Solid-ISP: how every commit produced by the shared git engine
 * (`packages/core/src/lib/shared/git-write.ts`) should be attributed.
 *
 * - `mode: 'git'` (DEFAULT): the agent's commits land under the
 *   current `git config user.name` / `user.email` so the user does
 *   not have to maintain two `git log --author` filters.
 * - `mode: 'agent' | 'bot' | 'named'`: explicit attribution to the
 *   driving agent (see `commit-author.ts` for the exact author flags
 *   each mode produces).
 *
 * `identity` is host-supplied (MCP `clientInfo` + the active model).
 * `named` is the only mode that consumes `humanName` / `humanEmail`
 * — the other modes ignore them so a user can leave the fields
 * unset.
 */
export interface IDelendaiCommitAuthorConfig {
	/** Which strategy to apply. Defaults to `'git'`. */
	readonly mode?: CommitAuthorMode;
	/** MCP `clientInfo.name` mapped through the host's extension table. */
	readonly clientName?: string;
	/** Active model identifier (e.g. `MiniMax-M3`). */
	readonly modelName?: string;
	/** Human display name for `mode: 'named'`. */
	readonly humanName?: string;
	/** Human email for `mode: 'named'`. */
	readonly humanEmail?: string;
}

/**
 * Solid-ISP: per-plugin configuration loaded from `delendai.config.json`.
 * Each plugin gets a typed `options` object (any JSON — nested
 * objects, arrays…) plus an optional tool-namespace `prefix`. CLI
 * flags override these roots; the file is the place for anything
 * beyond a quick override.
 *
 * ```jsonc
 * {
 *   "plugins": {
 *     "proposals": { "prefix": "work", "options": { "docsDir": "docs/x" } }
 *   }
 * }
 * ```
 */
export interface IDelendaiPluginConfig {
	/**
	 * Explicit activation override. `false` suppresses the plugin even when a
	 * preset or `--plugins` selected it; `true` keeps/activates the entry.
	 */
	readonly enabled?: boolean;
	/** Last known origin, persisted by activation UIs for disabled entries. */
	readonly origin?: PluginOrigin;
	readonly prefix?: string;
	readonly options?: Readonly<Record<string, unknown>>;
	/**
	 * f00087 S1: explicit module path for a local plugin.
	 *
	 * When set, `assembleCliConfig` rewrites the specifier from the
	 * entry's bare name to this resolved path before handing it to
	 * `loadPlugins`. Relative paths are resolved against the workspace
	 * root; absolute paths and `file:`/`./`/`/`-prefixed values are
	 * forwarded verbatim (the existing `resolvePluginSpecifier` chain
	 * accepts all of those forms already).
	 */
	readonly path?: string;
}

/**
 * Solid-ISP: loop-detector tuning. Hosts that DO NOT use the proposals
 * plugin never see this — but the core still types it because the
 * config file is a single document.
 */
export interface ILoopDetectorConfig {
	readonly enabled?: boolean;
	readonly repeatThreshold?: number;
	readonly nearRepeatThreshold?: number;
	readonly similarityThreshold?: number;
	readonly idleThreshold?: number;
	readonly noProgressThreshold?: number;
	readonly ringSize?: number;
	readonly gitCheckTools?: readonly string[];
	readonly handoffDir?: string;
	readonly handoffTtlDays?: number;
	readonly notifyOnDetect?: boolean;
	readonly cooldownMs?: number;
	/**
	 * Agent names (or glob patterns) the detector MUST ignore. Designed
	 * for interactive host sessions (e.g. `copilot-default`,
	 * `cursor-default`) where repeating the same orient tool a handful
	 * of times is legitimate, not a loop. Exact strings match the
	 * agent verbatim; each entry that contains `*` or `?` is treated
	 * as a minimatch-style wildcard.
	 *
	 * Defaults (when omitted): `["*-default", "default-*", "host",
	 * "interactive"]` — the patterns every host reports its single
	 * user-facing session under. Set to `[]` to monitor every agent.
	 */
	readonly interactiveAgentPatterns?: readonly string[];
}

/**
 * Solid-ISP: f00072 S3 — cache eviction policy.
 *
 * Governs the boot-time sweep run by `assembleCliConfig` over the
 * shared `<cacheDir>` root and the rules contributed by the opt-in
 * `@delendai/cache` plugin (plus any plugin that registers a rule
 * against `ctx.cacheEvictionRegistry`).
 *
 * All fields are optional with safe defaults — an existing config
 * without a `cache` block behaves exactly as before:
 *
 * - `runOnBoot` defaults to `'dry-run'`: the boot sweep only logs the
 *   report (it removes nothing). `'apply'` is the only mode that
 *   actually deletes; `'off'` skips the sweep entirely.
 * - `maxAgeDays` is the upper cap applied to every `olderThanDays`
 *   rule, so a host can shorten (never silently lengthen) the built-in
 *   lifetimes without editing plugin code. Default 30.
 * - `worktrees` tunes the orphan-worktree sweeper (f00072 S5): keep
 *   the most-recent `keepLastN` crashed-agent worktrees under
 *   `<cacheDir>/.worktrees/`, prune the rest. Default on, keep 3.
 */
export interface IDelendaiCacheWorktreesConfig {
	/** Default true. When false the worktree-orphan rule never applies. */
	readonly enabled?: boolean;
	/** Default 3. Keep the most-recent N worktrees by mtime. */
	readonly keepLastN?: number;
}

export interface IDelendaiCachePolicyConfig {
	/**
	 * Boot-sweep posture. `'dry-run'` (default) only logs a report;
	 * `'apply'` deletes the evictable entries; `'off'` runs nothing.
	 */
	readonly runOnBoot?: 'dry-run' | 'apply' | 'off';
	/** Upper cap (days) applied to every `olderThanDays` rule. Default 30. */
	readonly maxAgeDays?: number;
	/** Orphan-worktree sweeper tuning (f00072 S5). */
	readonly worktrees?: IDelendaiCacheWorktreesConfig;
}

/**
 * Composite config-file shape — every field of every sub-interface.
 * Kept exported because callers that legitimately want everything
 * (the parser, the doctor) need a single type. Callers that only
 * want a slice should depend on the relevant sub-interface instead
 * (e.g. `IDelendaiCorePathsConfig`).
 */
export interface IDelendaiConfigFile extends IDelendaiCorePathsConfig {
	/** Optional editor hint pointing at the published JSON Schema. */
	readonly $schema?: string;
	/** Optional explicit surface override. Omitted => managed. */
	readonly surfaceMode?: IMcpToolSurfaceMode;
	/** Optional operator-facing startup report configuration. */
	readonly startupReport?: IStartupReportConfig;
	/** Optional managed-surface working-set policy. */
	readonly managedSurface?: IManagedSurfaceConfig;
	/** Optional runtime evidence retention policy. */
	readonly evidence?: IEvidenceConfig;
	/**
	 * Host-scoped capability gate for `agent_worktree`. Default `false`.
	 * When `false` (or unset) the proposals plugin's
	 * `delendai_proposals_agent_worktree` tool stays registered but returns a
	 * structured `ok: false` error telling the caller how to enable it.
	 * A host that needs multi-agent worktree isolation flips it to
	 * `true` here (or via the `--agent-worktree` CLI flag, which wins).
	 */
	readonly agentWorktree?: boolean;
	/** Core-owned runtime and agent policies. */
	readonly core?: IDelendaiCoreConfig;
	/**
	 * f00082: how every commit produced by the shared git engine
	 * should be attributed. Defaults to `'git'` (the current
	 * `git config user.name` / `user.email`). See
	 * `commit-author.ts` for the full mode matrix and
	 * `IDelendaiCommitAuthorConfig` for the schema.
	 */
	readonly commitAuthor?: IDelendaiCommitAuthorConfig;
	readonly plugins?: Readonly<Record<string, IDelendaiPluginConfig>>;
	/**
	 * f00067a S1: root-level multi-model provider roster. Entries mirror
	 * `IProviderCapabilities` field-for-field (the Zod schema in
	 * `config-file-schema.ts` is the validating source of truth; ids are
	 * kebab-case and unique). Canonical home here so peer plugins can read
	 * the roster without coupling to the orchestrator-runner plugin.
	 */
	readonly providers?: ReadonlyArray<IProviderCapabilities>;
	/**
	 * f00089 U5: native default filesystem allowlist (authorized roots).
	 * See {@link IFilesystemConfig}.
	 */
	readonly filesystem?: IFilesystemConfig;
	readonly validationMatrix?: IValidationMatrixConfig;
	readonly loopDetector?: ILoopDetectorConfig;
	/**
	 * f00072 S3: cache eviction policy. Governs the boot-time sweep over
	 * `<cacheDir>` and the opt-in `@delendai/cache` plugin. Omitted ⇒
	 * `runOnBoot: 'dry-run'` (safe: logs the report, deletes nothing).
	 * See {@link IDelendaiCachePolicyConfig}.
	 */
	readonly cache?: IDelendaiCachePolicyConfig;
	/**
	 * Optional bootstrap layer configuration. Hosts use this to teach
	 * the bootstrap blueprint about project types, tool lists and
	 * knowledge hints that the hardcoded catalog does not cover. See
	 * `bootstrap/pattern-catalog-overrides.ts` for the merge rules.
	 */
	readonly bootstrap?: IBootstrapPatternOverrides;
	/** Optional local plugin-registry additions for discovery tools. */
	readonly pluginRegistry?: import('../contracts/interfaces/plugin-registry.interface').IPluginRegistryConfig;
	/**
	 * f00152 S1 (L1 — version pin): optional semver string pinning the
	 * self-host agent to a specific published `@delendai/core`
	 * version. When omitted, the lint treats the pin as
	 * `'latest-published'` (the latest tag from the npm registry).
	 * The sentinel `latest-published` is also accepted for explicit
	 * "track latest" intent. See `tools/scripts/lint/core-version-pin.script.ts`.
	 */
	readonly coreVersion?: string;
}

export interface IDelendaiCoreConfig {
	/** Global agent execution mode and engineering principles. */
	readonly agentPolicy?: IDelendaiAgentPolicyConfig;
}

export interface IDelendaiAgentPolicyConfig {
	readonly autonomous?: boolean;
	readonly principles?: ReadonlyArray<string>;
}

export const DEFAULT_AGENT_POLICY: Required<IDelendaiAgentPolicyConfig> = {
	autonomous: true,
	principles: [
		'Apply SOLID architecture where it improves ownership and changeability.',
		'Use good engineering practices and keep the code clear and maintainable.',
		'Reuse existing code and abstractions before introducing duplication.',
		'Keep naming, files, and folders homogeneous with the surrounding project.',
	],
};

/** Default config file name looked up at the workspace root. */
export const DEFAULT_CONFIG_FILENAME = 'delendai.config.json';

/**
 * Solid-SRP: re-export the Zod schema from its own module so callers
 * that only need the schema can import it directly. The schema lives
 * in `config-file-schema.ts`; the parser + doctor live here.
 */
export { CONFIG_FILE_SCHEMA } from './config-file-schema';

/**
 * Validate raw config-file contents and report problems. Used by the
 * `--check` doctor and at boot. Missing file → no issues. Invalid JSON
 * or schema violations → human-readable issue strings.
 */
export const diagnoseConfigFile = (
	raw: string | undefined,
): { readonly present: boolean; readonly issues: readonly string[] } => {
	if (raw === undefined) return { present: false, issues: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			present: true,
			issues: [
				`invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
	const result = CONFIG_FILE_SCHEMA.safeParse(parsed);
	if (result.success) return { present: true, issues: [] };
	return {
		present: true,
		issues: result.error.issues.map(
			(issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
		),
	};
};

/**
 * Parse a config file's raw contents. Pure and forgiving: missing
 * (`undefined`) or invalid JSON yields an empty config, so a typo in
 * the file never crashes the server — it just contributes nothing.
 */
export const parseConfigFile = (
	raw: string | undefined,
): IDelendaiConfigFile => {
	if (raw === undefined) return {};
	try {
		const value = JSON.parse(raw) as unknown;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return value as IDelendaiConfigFile;
		}
		return {};
	} catch {
		return {};
	}
};

/** Resolve the per-plugin entry, never undefined. */
export const pluginConfigFor = (
	config: IDelendaiConfigFile,
	pluginName: string,
): IDelendaiPluginConfig => config.plugins?.[pluginName] ?? {};

/** A path that `resolvePluginSpecifier` already accepts verbatim. */
const isAbsoluteOrSchemeSpec = (value: string): boolean =>
	value.startsWith('/') ||
	value.startsWith('./') ||
	value.startsWith('../') ||
	value.startsWith('file:');

/**
 * f00087 S1: build the list of module specifiers the loader should
 * try, replacing each entry that declares `path` with that resolved
 * path. Relative paths resolve against `workspaceRoot` (the absolute
 * workspace root the host handed us, NOT the cwd of the server
 * process); absolute paths and scheme-prefixed values pass through
 * verbatim because `resolvePluginSpecifier` already handles them.
 *
 * Pure — the function never imports or touches the filesystem beyond
 * the `isAbsolute` check, and `resolvePluginSpecifier` only string-
 * transforms the path.
 */
export const resolveConfigPluginSpecifiers = (
	config: IDelendaiConfigFile,
	workspaceRoot: string,
): readonly string[] => {
	const plugins = config.plugins ?? {};
	const out: string[] = [];
	for (const [name, entry] of Object.entries(plugins)) {
		const path = entry.path;
		if (path === undefined || path.length === 0) {
			// Bare-name fallback: `loadPlugins` will try
			// `@delendai/<name>` then `mcp-<name>` then `<name>`.
			out.push(name);
			continue;
		}
		if (isAbsoluteOrSchemeSpec(path)) {
			out.push(path);
			continue;
		}
		// Relative path: resolve against the workspace root. We use a
		// string join + path.resolve semantics (Node's `path` is not
		// available here, but workspaceRoot is already absolute).
		const normalised = path.replace(/\\/g, '/');
		out.push(
			workspaceRoot.endsWith('/')
				? `${workspaceRoot}${normalised}`
				: `${workspaceRoot}/${normalised}`,
		);
	}
	return out;
};

/**
 * f00087 S1: report config-typo guards for the new `path` field.
 * A `path` value that has no filesystem separator AND is not absolute
 * AND not scheme-prefixed is almost certainly a typo (`"path": "lx-app"`
 * when the user meant `"./dist/index.js"`); surface that at boot
 * instead of letting the loader fail later with a less obvious error.
 */
export const diagnosePluginPathConfig = (
	entry: IDelendaiPluginConfig,
	pluginName: string,
): readonly string[] => {
	const issues: string[] = [];
	const path = entry.path;
	if (path === undefined) return issues;
	if (path.length === 0) {
		issues.push(`plugins.${pluginName}.path: must not be empty`);
		return issues;
	}
	if (isAbsoluteOrSchemeSpec(path)) return issues;
	if (!path.includes('/') && !path.includes('\\')) {
		issues.push(
			`plugins.${pluginName}.path: "${path}" looks like a bare name; expected a path with a separator (e.g. "./dist/index.js")`,
		);
	}
	return issues;
};
