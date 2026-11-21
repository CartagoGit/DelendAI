export interface IPresetConfigs {
	readonly linterConfigFile: string;
	readonly typecheckConfigFile?: string | undefined;
	readonly linterConfigContent: string;
	readonly typecheckConfigContent?: string | undefined;

	// Deprecated backward-compatible aliases
	readonly eslintConfigFile?: string | undefined;
	readonly tsconfigFile?: string | undefined;
	readonly eslintConfigContent?: string | undefined;
	readonly tsconfigContent?: string | undefined;
}
