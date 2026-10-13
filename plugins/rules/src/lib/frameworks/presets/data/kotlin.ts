import type { IRulePreset } from '../../contracts';

/**
 * Kotlin (ktlint) preset — DATA only.
 *
 * Single Responsibility: the baseline `.editorconfig` ktlint section
 * + bullets for Kotlin. The project's own `.editorconfig` wins; the
 * Gradle `compileKotlin` task is the typecheck.
 */
export const KOTLIN_PRESET: IRulePreset = {
	id: 'kotlin-ktlint',
	framework: 'kotlin',
	language: 'kt',
	linter: 'ktlint',
	linterConfigFile: 'kotlin-ktlint.editorconfig',
	linterConfigContent: `# Baseline ktlint config (the project's own .editorconfig wins).
[*.{kt,kts}]
ktlint_standard = enabled
max_line_length = 120
`,
	conventions: [
		'Use `val` over `var`; prefer immutable data classes.',
		'Embrace null safety: prefer `?.`/`?:` over `!!`.',
		'Coroutines over raw threads for concurrency.',
		'Run `ktlint` to check and `ktlint -F` to format.',
	],
	requiredLinterDeps: ['ktlint'],
};
