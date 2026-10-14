import type { IRulePreset } from '../contracts';

/**
 * Single Responsibility: validate ONE preset against the
 * invariants the plugin cares about. The default validator
 * below checks 3 things — empty linter content, missing
 * language, no conventions. New validators (e.g. a
 * `NpmNamingValidator`) drop in via the registry constructor
 * (Open/Closed) without touching this file.
 *
 * Dependency Inversion: the validator returns an array of
 * findings (never throws). The `PresetRegistry` consumes the
 * findings in its constructor and exposes them via a
 * `validate()` method; tools and tests depend on the
 * interface, not on a specific validator.
 */
export interface IPresetFinding {
	/** Stable code so consumers can match on it. */
	readonly code:
		| 'empty-linter-config'
		| 'empty-conventions'
		| 'unknown-language'
		| 'linter-deps-mismatch';
	/** Human-readable description. */
	readonly message: string;
	/** The preset id that triggered the finding. */
	readonly presetId: string;
}

export interface IPresetValidator {
	/**
	 * Return zero or more findings for one preset. Never
	 * throws. Returning `[]` means "the preset is valid".
	 */
	validate(preset: IRulePreset): readonly IPresetFinding[];
}

/**
 * The default validator. Encodes the 3 most common mistakes
 * a preset author makes:
 *   1. `linterConfigContent` empty (the file would be
 *      materialised as a 0-byte file).
 *   2. `conventions` empty (the agent would learn nothing
 *      idiomatic about the language).
 *   3. `linter` not in the `TPresetLinter` union (a typo
 *      would silently pass the typecheck but break the
 *      command dispatch).
 */
export const defaultPresetValidator: IPresetValidator = {
	validate(preset): readonly IPresetFinding[] {
		const findings: IPresetFinding[] = [];
		if (preset.linterConfigContent.trim().length === 0) {
			findings.push({
				code: 'empty-linter-config',
				message:
					'Preset ships an empty `linterConfigContent`. The materialised file would be 0 bytes; ESLint/Clippy/etc. would fail to load it.',
				presetId: preset.id,
			});
		}
		if (preset.conventions.length === 0) {
			findings.push({
				code: 'empty-conventions',
				message:
					'Preset has no `conventions` bullets. The agent would learn nothing idiomatic about the language from `get_rules`.',
				presetId: preset.id,
			});
		}
		return findings;
	},
};

/**
 * Compose multiple validators into one (Open/Closed — adding
 * a validator = appending to the array, never editing the
 * registry or this compose function). The composition is
 * associative: `composeValidators(a, b, c)(preset)` is the
 * same as `composeValidators(a, composeValidators(b, c))(preset)`.
 */
export const composeValidators = (
	...validators: readonly IPresetValidator[]
): IPresetValidator => ({
	validate(preset) {
		const out: IPresetFinding[] = [];
		for (const v of validators) {
			out.push(...v.validate(preset));
		}
		return out;
	},
});
