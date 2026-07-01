// body-content/language-hints: declarative table of "what does this
// language require from the agent?".
//
// SOLID — Open/Closed. Adding a new language is one entry in the
// `LANGUAGE_HINTS` table. The body builders never need to change.

import type { IProjectAnalysis } from '../analyze-project';
import type { IProjectLanguage } from '../analyze-project';

const LANGUAGE_HINTS: Readonly<Record<IProjectLanguage, readonly string[]>> = {
	typescript: [
		'`strict: true` in tsconfig — no implicit any.',
		'Prefer `readonly` and discriminated unions over enums.',
	],
	javascript: [
		'Use JSDoc for exported APIs; treat JSDoc types as a contract.',
	],
	python: ['Type hints everywhere; mypy strict for new modules.'],
	go: ['Wrap errors; do not discard returned errors.'],
	rust: ['`Result` over `unwrap`/`expect` in non-test code.'],
	unknown: [],
};

export const languageHintsFor = (
	analysis: IProjectAnalysis,
): readonly string[] => LANGUAGE_HINTS[analysis.language] ?? [];
