import type { CommitAuthorMode } from '../shared/commit-author';
import { CONFIG_FILE_SCHEMA } from './config-file-schema';

/**
 * Solid-ISP: each concern of the config file lives in its own
 * sub-interface so callers depend only on what they need. A consumer
 * that just wants the core paths (cacheDir/docsDir) does NOT have to
 * import the loop detector config type, the bootstrap overrides, etc.
 *
 * The composite `IMcpVertexConfigFile` is the union of every sub-
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
export interface IMcpVertexCorePathsConfig {
	readonly cacheDir?: string;
	readonly docsDir?: string;
	/**
	 * Default false. When true, scaffold regeneration preserves existing
	 * files under legacy/ before writing fresh templates.
	 */
	readonly keepLegacy?: boolean;
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
export interface IMcpVertexCommitAuthorConfig {
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
 * Solid-ISP: per-plugin configuration loaded from `mcp-vertex.config.json`.
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
export interface IMcpVertexPluginConfig {
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
 * Composite config-file shape — every field of every sub-interface.
 * Kept exported because callers that legitimately want everything
 * (the parser, the doctor) need a single type. Callers that only
 * want a slice should depend on the relevant sub-interface instead
 * (e.g. `IMcpVertexCorePathsConfig`).
 */
export interface IMcpVertexConfigFile extends IMcpVertexCorePathsConfig {
	/** Optional editor hint pointing at the published JSON Schema. */
	readonly $schema?: string;
	/**
	 * Host-scoped capability gate for `agent_worktree`. Default `false`.
	 * When `false` (or unset) the proposals plugin's
	 * `mcp-vertex_proposals_agent_worktree` tool stays registered but returns a
	 * structured `ok: false` error telling the caller how to enable it.
	 * A host that needs multi-agent worktree isolation flips it to
	 * `true` here (or via the `--agent-worktree` CLI flag, which wins).
	 */
	readonly agentWorktree?: boolean;
	/**
	 * f00082: how every commit produced by the shared git engine
	 * should be attributed. Defaults to `'git'` (the current
	 * `git config user.name` / `user.email`). See
	 * `commit-author.ts` for the full mode matrix and
	 * `IMcpVertexCommitAuthorConfig` for the schema.
	 */
	readonly commitAuthor?: IMcpVertexCommitAuthorConfig;
	readonly plugins?: Readonly<Record<string, IMcpVertexPluginConfig>>;
	readonly validationMatrix?: IValidationMatrixConfig;
	readonly loopDetector?: ILoopDetectorConfig;
	/**
	 * Optional bootstrap layer configuration. Hosts use this to teach
	 * the bootstrap blueprint about project types, tool lists and
	 * knowledge hints that the hardcoded catalog does not cover. See
	 * `bootstrap/pattern-catalog-overrides.ts` for the merge rules.
	 */
	readonly bootstrap?: IBootstrapPatternOverrides;
}

/** Default config file name looked up at the workspace root. */
export const DEFAULT_CONFIG_FILENAME = 'mcp-vertex.config.json';

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
): IMcpVertexConfigFile => {
	if (raw === undefined) return {};
	try {
		const value = JSON.parse(raw) as unknown;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return value as IMcpVertexConfigFile;
		}
		return {};
	} catch {
		return {};
	}
};

/** Resolve the per-plugin entry, never undefined. */
export const pluginConfigFor = (
	config: IMcpVertexConfigFile,
	pluginName: string,
): IMcpVertexPluginConfig => config.plugins?.[pluginName] ?? {};

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
	config: IMcpVertexConfigFile,
	workspaceRoot: string,
): readonly string[] => {
	const plugins = config.plugins ?? {};
	const out: string[] = [];
	for (const [name, entry] of Object.entries(plugins)) {
		const path = entry.path;
		if (path === undefined || path.length === 0) {
			// Bare-name fallback: `loadPlugins` will try
			// `@mcp-vertex/<name>` then `mcp-<name>` then `<name>`.
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
	entry: IMcpVertexPluginConfig,
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
