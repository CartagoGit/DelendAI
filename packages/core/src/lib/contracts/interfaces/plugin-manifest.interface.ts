import type { ITokenBudgetCeiling } from '../constants/token-budgets.constant';

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
	readonly permissions: readonly string[];
	readonly presets: readonly string[];
	readonly tokenBudget: ITokenBudgetCeiling;
	readonly dependencies: readonly string[];
	readonly capabilities: readonly string[];
}
