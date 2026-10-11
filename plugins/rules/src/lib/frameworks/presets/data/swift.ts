import type { IRulePreset } from '../../contracts';

/**
 * Swift (SwiftLint) preset — DATA only.
 *
 * Single Responsibility: the baseline `.swiftlint.yml` + bullets for
 * Swift. The project's own `.swiftlint.yml` layers on top and wins;
 * `swift build` is the typecheck.
 */
export const SWIFT_PRESET: IRulePreset = {
	id: 'swift-swiftlint',
	framework: 'swift',
	language: 'swift',
	linter: 'swiftlint',
	linterConfigFile: 'swift-swiftlint.swiftlint.yml',
	linterConfigContent: `# Baseline SwiftLint config (the project's own .swiftlint.yml wins).
disabled_rules: []
opt_in_rules:
  - empty_count
line_length: 120
`,
	conventions: [
		'Use `guard` for early-exit; keep the happy path un-indented.',
		'Prefer value types (struct/enum) over reference types (class).',
		'Handle Optionals explicitly; avoid force-unwrap (`!`) outside tests.',
		'Run `swiftlint` to lint and `swift-format` (or `swiftlint --fix`) to format.',
	],
	requiredLinterDeps: ['swiftlint'],
};
