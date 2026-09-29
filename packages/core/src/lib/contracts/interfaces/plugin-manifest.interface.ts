import type { ITokenBudgetCeiling } from '../constants/token-budgets.constant';
import type { PermissionCategory } from '../constants/permission-categories.constant';
import type { IAuthorityDeclaration } from './authority.interface';
import type { IPluginToolPermissions } from './plugin-tool-permissions.interface';
import type { IPluginTokenBudget } from './plugin-token-budget.interface';

export type PluginManifestVisibility = 'public' | 'private';

export type PluginManifestMaturity = 'experimental' | 'beta' | 'stable';

/**
 * `tokenBudget` accepts three shapes (f00179 S1, MAN-003):
 *  - `IPluginTokenBudget` — the new real-semantics shape with
 *    `staticBytes` + `caps` + `measuredAt` + `source`.
 *  - `ITokenBudgetCeiling` — the legacy `{hard, warning,
 *    releaseRelativePercent}` form, still valid for plugins that
 *    have not migrated.
 *  - `number` — bare byte count, interpreted as `staticBytes` (a
 *    third legacy form historically present in some first-party
 *    manifests).
 *
 * `resolveTokenBudget()` normalises every accepted form into
 * `IPluginTokenBudget` for downstream consumption.
 */
export type IPluginManifestTokenBudget =
	| number
	| ITokenBudgetCeiling
	| IPluginTokenBudget;

/**
 * f00502 S3: OVERRIDES for what `delendai init` writes above this
 * plugin's entry in `delendai.config.json`.
 *
 * Both fields are optional on purpose. The manifest already carries a
 * `summary`, and every plugin already has a generated documentation
 * page at the conventional path, so `resolvePluginConfigDocs` derives
 * the comment from what exists instead of asking 56 manifests to
 * repeat it. A plugin declares this block only when the config file
 * needs different wording from the catalog summary, or when its
 * options are documented somewhere other than the conventional page.
 *
 * Enablement is deliberately absent: the preset decides what is
 * enabled, and a manifest-level default would fight it.
 */
export interface IPluginConfigDocs {
	/** Replaces the manifest `summary` in the config comment. */
	readonly summary?: string | undefined;
	/** Replaces the conventional docs path with a repo-relative path. */
	readonly docsPath?: string | undefined;
}

/**
 * What a plugin contributes to `adopt_project`, declared so the core can
 * apply it without loading the plugin. Adoption usually runs before the
 * plugin is ever loaded: the point of wiring it is a later launch.
 *
 * `{value}` in the texts is replaced with the request field's value,
 * `{namespacePrefix}` with the adopted project's tool prefix.
 */
export interface IPluginAdoption {
	/** The adoption request field whose value wires this plugin. */
	readonly from: 'repo';
	/** The plugin option (`plugins.<id>.options.<option>`) set to that value. */
	readonly option: string;
	/** The preset to launch with once it is wired; one of the manifest's `presets`. */
	readonly launchPreset: string;
	/** Why the config changed, when it is wired. */
	readonly rationale: string;
	/** The step left to a person when it is wired. */
	readonly whenWired: string;
	/** The step left to a person when the request field was not given. */
	readonly whenNotWired: string;
}

export interface IPluginManifest {
	readonly id: string;
	readonly package: string;
	readonly version: string;
	readonly visibility: PluginManifestVisibility;
	readonly summary: string;
	readonly tags: readonly string[];
	readonly maturity: PluginManifestMaturity;
	/**
	 * Global permission set for the plugin — applies to every tool
	 * that does NOT have its own entry in `toolPermissions`. Always
	 * present so the default deny-by-default contract is anchored on
	 * an explicit declaration.
	 */
	readonly permissions: readonly PermissionCategory[];
	/**
	 * Per-tool permission set (f00180 S1, MAN-004). Keys are bare
	 * tool ids (before the `delendai_<plugin>_` namespace prefix).
	 * `resolveToolPermissions(perTool, global, toolId)` returns the
	 * per-tool entry when present, falling back to the global
	 * `permissions` set when absent.
	 */
	readonly toolPermissions?: IPluginToolPermissions | undefined;
	readonly presets: readonly string[];
	readonly tokenBudget: IPluginManifestTokenBudget;
	readonly dependencies: readonly string[];
	readonly capabilities: readonly string[];
	/** Plugin registration creates lifecycle side effects during boot. */
	readonly startupActivation?: boolean | undefined;
	/**
	 * Overrides for the configuration comment `init` writes. Absent for
	 * almost every plugin — see `IPluginConfigDocs`.
	 */
	readonly configDocs?: IPluginConfigDocs | undefined;
	/** What this plugin contributes to an adoption (`IPluginAdoption`). */
	readonly adoption?: IPluginAdoption | undefined;
	/**
	 * The facts this plugin keeps in more than one place: which copy is
	 * the authority and what derives the rest (`IAuthorityDeclaration`).
	 */
	readonly authorities?: readonly IAuthorityDeclaration[] | undefined;
}
