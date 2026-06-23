import type { TPresetLanguage } from './preset-identity.interface';

import type {
	IAsyncModelDogma,
	IErrorModelDogma,
	IImmutabilityDogma,
	INamingStyleDogma,
	INullSafetyDogma,
	IOwnershipDogma,
	ITestingDogma,
	IVisibilityDogma,
} from './dogma.interface';

/**
 * Single Responsibility: one language's idiomatic style. Composed
 * from 8 narrow concern interfaces (Interface Segregation) so a
 * future consumer can depend on the narrowest slice it needs.
 *
 * Dependency Inversion: tools consume this through a
 * `DogmaRegistry` (constructed with `readonly IDogmaAdapter[]`);
 * they never read a specific language's data file.
 */
export interface IDogmaAdapter
	extends IOwnershipDogma,
		IErrorModelDogma,
		INullSafetyDogma,
		INamingStyleDogma,
		IAsyncModelDogma,
		IVisibilityDogma,
		IImmutabilityDogma,
		ITestingDogma {
	/** Which language this dogma describes. */
	readonly language: TPresetLanguage;
	/**
	 * Human-readable language name (e.g. `Rust` for `rs`,
	 * `Python` for `py`). Used by the `stringDogmaRenderer`
	 * so the rendered payload is LLM-friendly ("Rust (cargo,
	 * rust-2024): …") rather than carrying opaque ISO tags
	 * ("rs (cargo, rust-2024): …"). Defaults to the ISO tag
	 * when the data file does not provide one.
	 *
	 * Single Responsibility: presentation concern lives on
	 * the data object, not in the renderer (which stays
	 * format-agnostic and never branches by language).
	 */
	readonly displayName?: string;
	/** Package manager / build tool (e.g. `cargo`, `npm`, `pip`). */
	readonly packageManager: string;
	/**
	 * Language-standard version this dogma was anchored to
	 * (e.g. `rust-2024`, `python-3.12`, `zig-0.13`). The audit
	 * plugin's `f00051-s3-dogma-freshness` check surfaces
	 * "stale dogma" findings against this field.
	 */
	readonly version: string;
	/**
	 * 3-7 idiomatic do/don't bullets per language. The S3 spec
	 * rejects generic ESLint-style advice; the bullets must be
	 * language-specific.
	 */
	readonly bullets: readonly string[];
}
