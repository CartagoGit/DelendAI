import type { IRulesMode } from '../contracts/mode.interface';

export type {
	TPresetLanguage,
	TPresetLinter,
	IPresetIdentity,
} from '../contracts/preset-identity.interface';
export type { IPresetConfigs } from '../contracts/preset-configs.interface';
export type { IPresetConventions } from '../contracts/preset-conventions.interface';
export type { IPresetCommands } from '../contracts/preset-commands.interface';
export type { IPresetToolchain } from '../contracts/preset-toolchain.interface';
export type { IRulePreset } from '../contracts/preset.interface';
export type { ICommandSet } from '../contracts/command-set.interface';
export type { ICommandSetProvider } from '../contracts/command-set-provider.interface';
export type {
	ILanguageAdapter,
	IDetectResult,
} from '../contracts/language-adapter.interface';
export type {
	IOwnershipDogma,
	IErrorModelDogma,
	INullSafetyDogma,
	INamingStyleDogma,
	IAsyncModelDogma,
	IVisibilityDogma,
	IImmutabilityDogma,
	ITestingDogma,
} from '../contracts/dogma.interface';
export type { IDogmaAdapter } from '../contracts/dogma-adapter.interface';
export { DogmaRegistry } from '../registry/dogma-registry';

export type { IRulesMode };
export { RULES_MODES, RULES_MODE_GUIDANCE } from '../contracts/mode.interface';

/** Per-area resolution in the cache manifest. Arrays are priority-ordered. */
export interface IAreaRules {
	readonly framework: string;
	readonly presetId: string;
	/** Configs (eslint, ruff, etc.), most-authoritative first (project, then our default). */
	readonly configs: readonly string[];
	/** Deprecated alias for configs, for backward compatibility. */
	readonly eslint: readonly string[];
	/** Typecheck configs, most-authoritative first. */
	readonly typecheck: readonly string[];
	/** Why this preset was chosen (detected dep/file, or forced). */
	readonly reason: string;
}

/**
 * The generated `rules-map.json`: project → area → resolution. Tells any
 * agent exactly which linter/tsconfig apply where, project config first.
 */
export interface IRulesManifest {
	readonly generatedAt: string;
	/** Hash of mode + overrides + detected presets; regenerate on change. */
	readonly fingerprint: string;
	readonly mode: IRulesMode;
	readonly projects: Readonly<
		Record<string, Readonly<Record<string, IAreaRules>>>
	>;
}
