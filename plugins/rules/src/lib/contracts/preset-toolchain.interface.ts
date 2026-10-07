export interface IPresetToolchain {
	readonly requiredLinterDeps?: readonly string[];
	readonly requiredToolchain?: readonly string[];
}
