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
	 * tool ids (before the `mcp-vertex_<plugin>_` namespace prefix).
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
}
