import {
	composeValidators,
	defaultPresetValidator,
	type IPresetValidator,
} from './validator';

/**
 * Single Responsibility: this file is the *only* place that
 * owns the *list* of validators. The composition root
 * (`factory.ts`) consumes the registry; consumers of the
 * registry depend on the `IPresetValidator[]` shape, not on
 * a specific validator.
 *
 * Open/Closed: adding a new validator = appending to the
 * `validators` array. The composition root never changes.
 * A test can pass a 1-element list to exercise a specific
 * check in isolation.
 *
 * Dependency Inversion: the registry exposes a `validate`
 * method that returns findings (never throws). The default
 * composition wires the default validator list; a test
 * can pass its own.
 */
export interface IValidatorRegistry {
	/** The full list of validators this registry will run. */
	readonly validators: readonly IPresetValidator[];
	/**
	 * Compose all validators into one and run them against a
	 * single preset. Returns the accumulated findings (an
	 * empty array means "the preset is valid").
	 */
	validate(
		preset: Parameters<IPresetValidator['validate']>[0],
	): ReturnType<IPresetValidator['validate']>;
}

/**
 * Build the default validator registry. Today the registry
 * is a thin wrapper around `composeValidators(...)`; the
 * wrapper exists so adding OCP extensions (e.g. a
 * `NpmNamingValidator` that runs only for `linter: 'eslint'`)
 * is a registry concern, not a `composeValidators` concern.
 */
export const buildValidatorRegistry = (
	validators: readonly IPresetValidator[] = [defaultPresetValidator],
): IValidatorRegistry => {
	const composed = composeValidators(...validators);
	return {
		validators,
		validate(preset) {
			return composed.validate(preset);
		},
	};
};
