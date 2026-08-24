import type { ITokenBudgetCeiling } from '../constants/token-budgets.constant';
import type { PermissionCategory } from '../constants/permission-categories.constant';
import type { IToolPermissionGrant } from './permission.interface';

export type PluginManifestVisibility = 'public' | 'private';

export type PluginManifestMaturity = 'experimental' | 'beta' | 'stable';

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
	readonly tokenBudget: ITokenBudgetCeiling;
	readonly dependencies: readonly string[];
	readonly capabilities: readonly string[];
}
