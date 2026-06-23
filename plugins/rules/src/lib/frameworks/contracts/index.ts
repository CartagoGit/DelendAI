/**
 * Barrel for the contracts layer. Consumers import from here so the
 * internal layout of `contracts/*` is free to evolve without
 * rippling (Open/Closed — contracts are the public contract; the
 * folder layout is an implementation detail).
 */
export type { ICommandSet } from './command-set.interface';
export type { ICommandSetProvider } from './command-set-provider.interface';
export type {
	ILanguageAdapter,
	ILanguageDetection,
} from './language-adapter.interface';
export type { IDogmaAdapter } from './dogma-adapter.interface';
export type {
	IAsyncModelDogma,
	IErrorModelDogma,
	IImmutabilityDogma,
	INamingStyleDogma,
	INullSafetyDogma,
	IOwnershipDogma,
	ITestingDogma,
	IVisibilityDogma,
} from './dogma.interface';
export type {
	IRulePreset,
	IPresetCommands,
	IPresetConfigs,
	IPresetConventions,
	IPresetIdentity,
	IPresetToolchain,
} from './preset.interface';
export type {
	TPresetLanguage,
	TPresetLinter,
} from './preset-identity.interface';
export type {
	TAsyncDogma,
	TErrorModelDogma,
	TImmutabilityDogma,
	TNamingDogma,
	TNullSafetyDogma,
	TOwnershipDogma,
	TTestingDogma,
	TVisibilityDogma,
} from './dogma.interface';
export type { IRulesMode } from './mode.interface';
export { RULES_MODES, RULES_MODE_GUIDANCE } from './mode.interface';
