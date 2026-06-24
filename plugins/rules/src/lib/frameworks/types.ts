/** How aggressively the agent applies the rules. Default: `mixed`. */
export type IRulesMode = 'strict' | 'mixed' | 'none' | 'proposal';

export const RULES_MODES: readonly IRulesMode[] = [
	'strict',
	'mixed',
	'none',
	'proposal',
];

export const RULES_MODE_GUIDANCE: Readonly<Record<IRulesMode, string>> = {
	strict: 'Actively bring code into full compliance: run the fixer and make manual edits until check_rules is clean.',
	mixed: 'Only fix/align files you create or touch; leave untouched files as-is.',
	none: 'Never auto-change code. Report violations only; let the human decide.',
	proposal:
		'Do not edit directly. Create proposals (proposals plugin) describing the changes needed to comply.',
};

/**
 * A default lint/type preset for one framework+language combination.
 * Shipped as DATA (config file contents as text) so this plugin has no
 * dependency on any framework's ESLint packages — the materialised
 * files are consumed by the PROJECT's own toolchain.
 */
export interface IRulePreset {
	/** Unique id, e.g. `angular`, `react-ts`, `vanilla-js`. */
	readonly id: string;
	/** Framework family, e.g. `angular`, `react`, `vue`, `vanilla`. */
	readonly framework: string;
	/**
	 * Programming-language family this preset targets. Widened in
	 * f00051 S2 beyond the original `ts | js | php` to carry the
	 * per-language presets (Python, Go, Rust, Ruby, Java, Kotlin,
	 * Swift, C#, Elixir). The full ~70-tag union lives in the SOLID
	 * core's `contracts/preset-identity.interface.ts`; this legacy
	 * facade carries the families currently wired into the live
	 * detection path.
	 */
	readonly language:
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
	/** The linter the preset targets (eslint for JS/TS, pint for PHP…). */
	readonly linter:
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
	/** Cache filename for the materialised ESLint config. */
	readonly eslintConfigFile: string;
	/** Cache filename for the materialised tsconfig (TS presets only). */
	readonly tsconfigFile?: string;
	/** ESLint flat-config file contents (text). */
	readonly eslintConfigContent: string;
	/** tsconfig contents (text), TS presets only. */
	readonly tsconfigContent?: string;
	/** Short, agent-facing convention bullets. */
	readonly conventions: readonly string[];
	/** npm packages the materialised ESLint config needs installed. */
	readonly requiredEslintDeps?: readonly string[];
	/**
	 * f00051 S4 — per-preset command templates. When set, the tools
	 * emit these verbatim instead of the legacy `eslint`/`pint`
	 * branches. The `{target}` placeholder is replaced with the area
	 * directory (`.` for the workspace root, otherwise the relative
	 * dir). A preset that omits these (JS/TS via `eslint`, PHP via
	 * `pint`) keeps the historical hardcoded behaviour byte-for-byte.
	 *
	 * `checkCommand`  — lint/validate the area (read-only).
	 * `fixCommand`    — auto-fix the area (may modify files).
	 * `typecheckCommand` — type-check the area; omit for languages with
	 *                   no separate typecheck step (Ruby/Java/Kotlin
	 *                   without a configured typechecker, etc.).
	 */
	readonly checkCommand?: string;
	readonly fixCommand?: string;
	readonly typecheckCommand?: string;
}

/** Per-area resolution in the cache manifest. Arrays are priority-ordered. */
export interface IAreaRules {
	readonly framework: string;
	readonly presetId: string;
	/** ESLint configs, most-authoritative first (project, then our default). */
	readonly eslint: readonly string[];
	/** Typecheck configs, most-authoritative first. */
	readonly typecheck: readonly string[];
	/** Why this preset was chosen (detected dep/file, or forced). */
	readonly reason: string;
}

/**
 * The generated `rules-map.json`: project → area → resolution. Tells any
 * agent exactly which ESLint/tsconfig apply where, project config first.
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
