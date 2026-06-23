/**
 * Identity segment of an `IRulePreset`.
 *
 * Segregated (ISP) so a caller that only needs to look up a preset by id
 * (the registry, the online freshness lookup) can depend on this and
 * nothing else.
 */
export interface IPresetIdentity {
	/** Unique id, e.g. `angular`, `react-ts`, `vanilla-js`, `python-ruff`. */
	readonly id: string;
	/** Framework family, e.g. `angular`, `react`, `python`. */
	readonly framework: string;
	/** Programming language family (ISO-style short tag). */
	readonly language: TPresetLanguage;
	/** The linter binary/tool the preset targets. */
	readonly linter: TPresetLinter;
}

/**
 * Programming language families this plugin knows how to materialise
 * rules for. The set is open by design: adding a language means adding
 * a new `ILanguageAdapter` and a new entry here (or, for languages
 * with no detection work yet, dropping a string literal into a new
 * adapter that returns the right `presetLanguage`).
 */
export type TPresetLanguage =
	| 'ts'
	| 'js'
	| 'php'
	| 'py'
	| 'go'
	| 'rs'
	| 'rb'
	| 'java'
	| 'kt'
	| 'swift'
	| 'cs'
	| 'ex';

/**
 * Linter binaries/tools this plugin knows how to wrap. Adapters that
 * need a new linter extend this union; the registry (DIP) dispatches by
 * `linter` so consumers stay closed for modification.
 */
export type TPresetLinter =
	| 'eslint'
	| 'pint'
	| 'ruff'
	| 'golangci-lint'
	| 'clippy'
	| 'rubocop'
	| 'checkstyle'
	| 'ktlint'
	| 'swiftlint'
	| 'dotnet-format'
	| 'credo';
