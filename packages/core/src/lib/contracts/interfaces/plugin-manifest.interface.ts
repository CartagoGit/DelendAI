import type { ITokenBudgetCeiling } from '../constants/token-budgets.constant';
import type { PermissionCategory } from '../constants/permission-categories.constant';
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
 * f00502 S3: what `delendai init` writes above this plugin's entry in
 * `delendai.config.json`, and what the docs site and the config schema
 * render for it.
 *
 * It exists so that text has exactly one home. Writing it by hand in an
 * init template would fork it from the docs the moment either changed,
 * and the generated config is supposed to teach the user what the
 * plugin does without sending them to look it up.
 */
export interface IPluginConfigDocs {
	/** One line, written for the user reading their own config file. */
	readonly summary: string;
	/** Where the full options live, as a repo-relative path or a URL. */
	readonly docs: string;
	/**
	 * Whether a preset that does not mention this plugin should leave it
	 * enabled. The preset still decides; this is the fallback answer
	 * when it says nothing.
	 */
	readonly defaultEnabled: boolean;
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
	 * Documentation `init` and the docs site read to describe this
	 * plugin's configuration. Optional while plugins adopt it; once a
	 * plugin declares it, it is the only source for that text.
	 */
	readonly configDocs?: IPluginConfigDocs | undefined;
}
