import type { ITokenBudgetCeiling } from '../constants/token-budgets.constant';
import type { PermissionCategory } from '../constants/permission-categories.constant';
import type { IToolPermissionGrant } from './permission.interface';
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
	readonly permissions: readonly PermissionCategory[];
	readonly toolPermissions?: readonly IToolPermissionGrant[] | undefined;
	readonly presets: readonly string[];
	readonly tokenBudget: IPluginManifestTokenBudget;
	readonly dependencies: readonly string[];
	readonly capabilities: readonly string[];
}
