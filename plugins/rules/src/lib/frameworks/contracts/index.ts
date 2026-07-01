// `frameworks/contracts/` re-exports the canonical plugin contract surface
// (defined in `plugins/rules/src/lib/contracts/`) so internal callers can
// keep importing from a single relative path (`../contracts`) regardless of
// which directory they live in. The locally-mirrored `*.interface.ts` files
// in this folder are kept for backward compatibility with any code that
// imported them directly; new code should import from `../../contracts`.
export type {
	IAsyncModelDogma,
	ICommandSet,
	ICommandSetProvider,
	IDetectResult,
	IDogmaAdapter,
	IErrorModelDogma,
	IImmutabilityDogma,
	ILanguageAdapter,
	ILanguageDetection,
	INamingStyleDogma,
	INullSafetyDogma,
	IOwnershipDogma,
	IPresetCommands,
	IPresetConfigs,
	IPresetConventions,
	IPresetIdentity,
	IPresetToolchain,
	IRulePreset,
	ITestingDogma,
	IVisibilityDogma,
	TPresetLanguage,
	TPresetLinter,
} from '../../contracts';
