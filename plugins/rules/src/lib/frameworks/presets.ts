import type { IRulePreset } from './types';

// Shared strict tsconfig for TS presets (materialised to cache; the
// project's own tsconfig is layered on top and wins).
const STRICT_TSCONFIG = `${JSON.stringify(
	{
		compilerOptions: {
			target: 'ES2022',
			module: 'ESNext',
			moduleResolution: 'bundler',
			strict: true,
			noUnusedLocals: true,
			noUnusedParameters: true,
			noImplicitOverride: true,
			noFallthroughCasesInSwitch: true,
			noImplicitReturns: true,
			exactOptionalPropertyTypes: true,
			forceConsistentCasingInFileNames: true,
			skipLibCheck: true,
		},
	},
	null,
	'\t',
)}\n`;

const ANGULAR_TSCONFIG = `${JSON.stringify(
	{
		compilerOptions: {
			target: 'ES2022',
			module: 'ESNext',
			moduleResolution: 'bundler',
			strict: true,
			noImplicitOverride: true,
			noPropertyAccessFromIndexSignature: true,
			noImplicitReturns: true,
			noFallthroughCasesInSwitch: true,
			skipLibCheck: true,
		},
		angularCompilerOptions: {
			strictInjectionParameters: true,
			strictInputAccessModifiers: true,
			strictTemplates: true,
		},
	},
	null,
	'\t',
)}\n`;

/**
 * Default presets, one per framework+language. `eslintConfigContent` is
 * a flat-config file the project's ESLint consumes; this plugin never
 * imports those ESLint packages itself (stays dependency-light).
 */
const BASE_PRESETS: readonly IRulePreset[] = [
	{
		id: 'vanilla-js',
		framework: 'vanilla',
		language: 'js',
		linter: 'eslint',
		eslintConfigFile: 'vanilla-js.eslint.config.mjs',
		eslintConfigContent: `import js from '@eslint/js';

// Default base for plain JavaScript. Project config is layered on top.
export default [
	js.configs.recommended,
	{
		rules: {
			'no-var': 'error',
			'prefer-const': 'error',
			eqeqeq: ['error', 'smart'],
			'no-console': 'warn',
			'no-unused-vars': 'warn',
		},
	},
];
`,
		conventions: [
			'Use const/let, never var; strict equality (===).',
			'No unused vars; avoid leftover console.* in committed code.',
		],
	},
	{
		id: 'vanilla-ts',
		framework: 'vanilla',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'vanilla-ts.eslint.config.mjs',
		tsconfigFile: 'vanilla-ts.tsconfig.json',
		eslintConfigContent: `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Default base for TypeScript. Project config is layered on top.
export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_' },
			],
			'@typescript-eslint/naming-convention': [
				'warn',
				{ selector: 'interface', format: ['PascalCase'], prefix: ['I'] },
				{ selector: 'typeAlias', format: ['PascalCase'] },
			],
		},
	},
];
`,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'Interfaces PascalCase with `I` prefix; type aliases PascalCase.',
			'Prefer `import type` for type-only imports; avoid `any`.',
			'Strict tsconfig (strict, noUnusedLocals, exactOptionalPropertyTypes).',
		],
	},
	{
		id: 'angular',
		framework: 'angular',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'angular.eslint.config.mjs',
		tsconfigFile: 'angular.tsconfig.json',
		eslintConfigContent: `import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

// Default Angular base. Project config is layered on top.
export default [
	...tseslint.configs.recommended,
	...angular.configs.tsRecommended,
	{
		processor: angular.processInlineTemplates,
		rules: {
			'@angular-eslint/directive-selector': [
				'error',
				{ type: 'attribute', prefix: 'app', style: 'camelCase' },
			],
			'@angular-eslint/component-selector': [
				'error',
				{ type: 'element', prefix: 'app', style: 'kebab-case' },
			],
			'@typescript-eslint/consistent-type-imports': 'error',
		},
	},
	{
		files: ['**/*.html'],
		extends: [...angular.configs.templateRecommended],
		rules: {},
	},
];
`,
		tsconfigContent: ANGULAR_TSCONFIG,
		conventions: [
			'Components: kebab-case element selector, prefix `app-`.',
			'Directives: camelCase attribute selector, prefix `app`.',
			'strictTemplates on; use signals (input()/output()/viewChild()), not decorators.',
		],
	},
	{
		id: 'react-ts',
		framework: 'react',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'react-ts.eslint.config.mjs',
		tsconfigFile: 'react-ts.tsconfig.json',
		eslintConfigContent: `import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Default React + TS base. Project config is layered on top.
export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.{ts,tsx}'],
		plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
		settings: { react: { version: 'detect' } },
		rules: {
			'react/react-in-jsx-scope': 'off',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
			'react/jsx-key': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
		},
	},
];
`,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'Function components; obey the Rules of Hooks; always key lists.',
			'No need for React in scope (modern JSX transform).',
		],
	},
	{
		id: 'react-js',
		framework: 'react',
		language: 'js',
		linter: 'eslint',
		eslintConfigFile: 'react-js.eslint.config.mjs',
		eslintConfigContent: `import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Default React + JS base. Project config is layered on top.
export default [
	js.configs.recommended,
	{
		files: ['**/*.{js,jsx}'],
		plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
		settings: { react: { version: 'detect' } },
		rules: {
			'react/react-in-jsx-scope': 'off',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
			'react/jsx-key': 'error',
		},
	},
];
`,
		conventions: [
			'Function components; obey the Rules of Hooks; always key lists.',
		],
	},
	{
		id: 'vue',
		framework: 'vue',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'vue.eslint.config.mjs',
		tsconfigFile: 'vue.tsconfig.json',
		eslintConfigContent: `import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

// Default Vue (script-setup, TS) base. Project config is layered on top.
export default [
	js.configs.recommended,
	...vue.configs['flat/recommended'],
	...tseslint.configs.recommended,
	{
		files: ['**/*.vue'],
		languageOptions: { parserOptions: { parser: tseslint.parser } },
		rules: {
			'vue/multi-word-component-names': 'error',
			'vue/component-api-style': ['error', ['script-setup', 'composition']],
		},
	},
];
`,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'Multi-word component names; `<script setup>` + Composition API.',
		],
	},
	{
		id: 'svelte',
		framework: 'svelte',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'svelte.eslint.config.mjs',
		tsconfigFile: 'svelte.tsconfig.json',
		eslintConfigContent: `import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

// Default Svelte (TS) base. Project config is layered on top.
export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: tseslint.parser } },
	},
];
`,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: ['TS in `<script lang="ts">`; follow svelte recommended.'],
	},
	{
		id: 'laravel',
		framework: 'laravel',
		language: 'php',
		linter: 'pint',
		eslintConfigFile: 'laravel.pint.json',
		eslintConfigContent: `${JSON.stringify(
			{
				preset: 'laravel',
				rules: {
					declare_strict_types: true,
					ordered_imports: { sort_algorithm: 'alpha' },
					no_unused_imports: true,
				},
			},
			null,
			'\t',
		)}\n`,
		conventions: [
			'PHP/Laravel: format with Pint (preset laravel); `declare(strict_types=1)`.',
			'Run `./vendor/bin/pint --test` to check, `./vendor/bin/pint` to fix.',
		],
	},
	{
		id: 'jquery',
		framework: 'jquery',
		language: 'js',
		linter: 'eslint',
		eslintConfigFile: 'jquery.eslint.config.mjs',
		eslintConfigContent: `import js from '@eslint/js';
import globals from 'globals';

// Default jQuery (browser) base. Project config is layered on top.
export default [
	js.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, $: 'readonly', jQuery: 'readonly' },
		},
		rules: {
			'no-undef': 'error',
			'no-unused-vars': 'warn',
			eqeqeq: ['error', 'smart'],
		},
	},
];
`,
		conventions: [
			'`$`/`jQuery` are globals; strict equality; cache jQuery selections.',
		],
	},
];

// --- meta-frameworks (H6) --------------------------------------------------
// Next/Nuxt/Astro/Remix/Solid ship React/Vue transitively, so a plain dep
// check misclassifies them. These presets REUSE the verified base lint/tsconfig
// (no fabricated config) and carry the framework-specific conventions + the
// framework's own ESLint plugin (see REQUIRED_ESLINT_DEPS) so a project layers
// it on top. TS-first (these ecosystems are TS-dominant); a JS project falls
// back to the react/vanilla JS base via detect-framework.
const base = (id: string): IRulePreset => {
	const p = BASE_PRESETS.find((preset) => preset.id === id);
	if (p === undefined) throw new Error(`base preset "${id}" not found`);
	return p;
};

const META_PRESETS: readonly IRulePreset[] = [
	{
		id: 'next-ts',
		framework: 'next',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'next-ts.eslint.config.mjs',
		tsconfigFile: 'next-ts.tsconfig.json',
		eslintConfigContent: base('react-ts').eslintConfigContent,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'App Router: Server Components by default; opt into client with `"use client"`.',
			'Use `next/image` and `next/link` (no raw `<img>`/`<a>` for internal nav).',
			'Fetch data in Server Components/route handlers, not `useEffect`.',
			'Layer `@next/eslint-plugin-next` (core-web-vitals) on top of this base.',
		],
	},
	{
		id: 'remix',
		framework: 'remix',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'remix.eslint.config.mjs',
		tsconfigFile: 'remix.tsconfig.json',
		eslintConfigContent: base('react-ts').eslintConfigContent,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'Data via `loader`/`action`; mutate with `<Form>`, not client fetch.',
			'Nested routes + `useLoaderData`; keep components server-friendly.',
		],
	},
	{
		id: 'nuxt',
		framework: 'nuxt',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'nuxt.eslint.config.mjs',
		tsconfigFile: 'nuxt.tsconfig.json',
		eslintConfigContent: base('vue').eslintConfigContent,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'Auto-imports for components/composables; `<script setup>` + Composition API.',
			'Server routes under `server/`; data via `useFetch`/`useAsyncData`.',
			'Layer `@nuxt/eslint` on top of this Vue base.',
		],
	},
	{
		id: 'astro',
		framework: 'astro',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'astro.eslint.config.mjs',
		tsconfigFile: 'astro.tsconfig.json',
		eslintConfigContent: base('vanilla-ts').eslintConfigContent,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'HTML-first `.astro` components; ship zero JS by default.',
			'Hydrate islands explicitly (`client:load`/`client:visible`).',
			'Layer `eslint-plugin-astro` (for `.astro` files) on top of this base.',
		],
	},
	{
		id: 'solid-ts',
		framework: 'solid',
		language: 'ts',
		linter: 'eslint',
		eslintConfigFile: 'solid-ts.eslint.config.mjs',
		tsconfigFile: 'solid-ts.tsconfig.json',
		eslintConfigContent: base('vanilla-ts').eslintConfigContent,
		tsconfigContent: STRICT_TSCONFIG,
		conventions: [
			'Reactivity is via signals/stores — NOT React hooks rules.',
			'Components run once; put reactive reads inside JSX or effects.',
			'Layer `eslint-plugin-solid` on top of this base.',
		],
	},
];

// --- per-language presets (f00051 S2/S3) ----------------------------------
// One baseline preset per non-JS/TS language family wired into the live
// detection path (detect-framework.ts). DATA only: the `eslintConfigFile`/
// `eslintConfigContent` fields carry the language's *linter* config path +
// text (the field name is historical; the value is the materialised config
// the PROJECT's own toolchain consumes). `conventions` are language-specific
// (NOT ESLint-style advice); `requiredEslintDeps` names the binaries the
// project must install. Curated bullet quality lands in f00052.
const LANGUAGE_PRESETS: readonly IRulePreset[] = [
	{
		id: 'python-ruff',
		framework: 'python',
		language: 'py',
		linter: 'ruff',
		eslintConfigFile: 'python-ruff.ruff.toml',
		eslintConfigContent: `# Baseline ruff config (the project's own pyproject.toml [tool.ruff] wins).
line-length = 88
target-version = "py312"

[lint]
select = ["E", "F", "I", "UP", "B"]
`,
		conventions: [
			'Use `from __future__ import annotations`; prefer type hints everywhere.',
			'EAFP over LBYL: `try/except` rather than pre-checking.',
			'snake_case for functions/variables, PascalCase for classes.',
			'Prefer comprehensions and generators over manual loops where readable.',
			'Run `ruff check .` to lint and `ruff format .` to format.',
		],
		requiredLinterDeps: ['ruff'],
		checkCommand: 'ruff check {target}',
		fixCommand: 'ruff check --fix {target}',
		typecheckCommand: 'basedpyright {target}',
	},
	{
		id: 'go-golangci',
		framework: 'go',
		language: 'go',
		linter: 'golangci-lint',
		eslintConfigFile: 'go-golangci.golangci.yml',
		eslintConfigContent: `# Baseline golangci-lint config (the project's own .golangci.yml wins).
linters:
  enable:
    - govet
    - staticcheck
    - errcheck
    - ineffassign
`,
		conventions: [
			'Errors are values: wrap with `fmt.Errorf("...: %w", err)`, never panic in libraries.',
			'Exported identifiers are PascalCase; unexported are camelCase.',
			'Do not communicate by sharing memory; share memory by communicating.',
			'Accept interfaces, return concrete types; keep interfaces small.',
			'Run `golangci-lint run ./...` and `go vet ./...` before committing.',
		],
		requiredLinterDeps: ['golangci-lint'],
		checkCommand: 'golangci-lint run ./...',
		fixCommand: 'golangci-lint run --fix ./...',
		typecheckCommand: 'go vet ./...',
	},
	{
		id: 'rust-clippy',
		framework: 'rust',
		language: 'rs',
		linter: 'clippy',
		eslintConfigFile: 'rust-clippy.clippy.toml',
		eslintConfigContent: `# Baseline clippy config (the project's own Cargo.toml [lints] wins).
avoid-breaking-exported-api = false
`,
		conventions: [
			'Prefer `?` over `unwrap()` in library code; reserve `unwrap()` for tests.',
			'Use `#[must_use]` on fallible builders and Result-returning constructors.',
			'Never `clone()` to satisfy the borrow checker; refactor the signature instead.',
			'Default to immutable bindings; reach for `let mut` only when the value mutates.',
			'Run `cargo clippy --workspace --all-targets -- -D warnings` before every commit.',
		],
		requiredLinterDeps: ['cargo', 'clippy'],
		checkCommand: 'cargo clippy --workspace --all-targets -- -D warnings',
		fixCommand: 'cargo clippy --fix --workspace --all-targets',
		typecheckCommand: 'cargo check --workspace',
	},
	{
		id: 'ruby-rubocop',
		framework: 'ruby',
		language: 'rb',
		linter: 'rubocop',
		eslintConfigFile: 'ruby-rubocop.rubocop.yml',
		eslintConfigContent: `# Baseline RuboCop config (the project's own .rubocop.yml wins).
AllCops:
  NewCops: enable
  TargetRubyVersion: 3.3
`,
		conventions: [
			'snake_case for methods/variables, CamelCase for classes/modules.',
			'Prefer guard clauses; return early rather than nesting conditionals.',
			'Use `{ ... }` for single-line blocks, `do ... end` for multi-line.',
			'Favour `&.` (safe navigation) over explicit nil checks.',
			'Run `rubocop` to lint and `rubocop -a` to auto-correct.',
		],
		requiredLinterDeps: ['rubocop'],
		checkCommand: 'rubocop {target}',
		fixCommand: 'rubocop -a {target}',
	},
	{
		id: 'java-checkstyle',
		framework: 'java',
		language: 'java',
		linter: 'checkstyle',
		eslintConfigFile: 'java-checkstyle.checkstyle.xml',
		eslintConfigContent: `<?xml version="1.0"?>
<!-- Baseline Checkstyle config (the project's own checkstyle.xml wins). -->
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
  "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <module name="TreeWalker">
    <module name="UnusedImports"/>
    <module name="EmptyBlock"/>
  </module>
</module>
`,
		conventions: [
			'PascalCase for classes, camelCase for methods/fields, UPPER_SNAKE for constants.',
			'Favour immutability: `final` fields, defensive copies of mutable inputs.',
			'Prefer composition over inheritance; program to interfaces.',
			'Use checked exceptions deliberately; never swallow exceptions silently.',
			'Run Checkstyle (or Spotless) in the build before merge.',
		],
		requiredLinterDeps: ['checkstyle'],
		checkCommand: './gradlew checkstyleMain',
		fixCommand: './gradlew spotlessApply',
		typecheckCommand: './gradlew compileJava',
	},
	{
		id: 'kotlin-ktlint',
		framework: 'kotlin',
		language: 'kt',
		linter: 'ktlint',
		eslintConfigFile: 'kotlin-ktlint.editorconfig',
		eslintConfigContent: `# Baseline ktlint config (the project's own .editorconfig wins).
[*.{kt,kts}]
ktlint_standard = enabled
max_line_length = 120
`,
		conventions: [
			'Use `val` over `var`; prefer immutable data classes.',
			'Embrace null safety: prefer `?.`/`?:` over `!!`.',
			'Coroutines over raw threads for concurrency.',
			'PascalCase for classes, camelCase for functions/properties.',
			'Run `ktlint` to check and `ktlint -F` to format.',
		],
		requiredLinterDeps: ['ktlint'],
		checkCommand: 'ktlint',
		fixCommand: 'ktlint -F',
		typecheckCommand: './gradlew compileKotlin',
	},
	{
		id: 'swift-swiftlint',
		framework: 'swift',
		language: 'swift',
		linter: 'swiftlint',
		eslintConfigFile: 'swift-swiftlint.swiftlint.yml',
		eslintConfigContent: `# Baseline SwiftLint config (the project's own .swiftlint.yml wins).
disabled_rules: []
opt_in_rules:
  - empty_count
line_length: 120
`,
		conventions: [
			'Use `guard` for early-exit; keep the happy path un-indented.',
			'Prefer value types (struct/enum) over reference types (class).',
			'Handle Optionals explicitly; avoid force-unwrap (`!`) outside tests.',
			'lowerCamelCase for properties/functions, UpperCamelCase for types.',
			'Run `swiftlint` to lint and `swift-format` (or `swiftlint --fix`) to format.',
		],
		requiredLinterDeps: ['swiftlint'],
		checkCommand: 'swiftlint lint',
		fixCommand: 'swiftlint --fix',
		typecheckCommand: 'swift build',
	},
	{
		id: 'csharp-dotnet',
		framework: 'dotnet',
		language: 'cs',
		linter: 'dotnet-format',
		eslintConfigFile: 'csharp-dotnet.editorconfig',
		eslintConfigContent: `# Baseline .NET analyzer config (the project's own .editorconfig wins).
[*.cs]
dotnet_diagnostic.CA1822.severity = suggestion
csharp_style_namespace_declarations = file_scoped:warning
`,
		conventions: [
			'PascalCase for types/methods/properties, camelCase for locals/parameters.',
			'Enable nullable reference types; treat `Nullable<T>` warnings as errors.',
			'Prefer `async`/`await` over blocking; suffix async methods with `Async`.',
			'Use file-scoped namespaces and expression-bodied members where clear.',
			'Run `dotnet format` to fix and `dotnet build -warnaserror` to verify.',
		],
		requiredLinterDeps: ['dotnet'],
		checkCommand: 'dotnet format --verify-no-changes',
		fixCommand: 'dotnet format',
		typecheckCommand: 'dotnet build -p:TreatWarningsAsErrors=true',
	},
	{
		id: 'elixir-credo',
		framework: 'elixir',
		language: 'ex',
		linter: 'credo',
		eslintConfigFile: 'elixir-credo.credo.exs',
		eslintConfigContent: `# Baseline Credo config (the project's own .credo.exs wins).
%{
  configs: [
    %{
      name: "default",
      strict: true,
      checks: %{enabled: []}
    }
  ]
}
`,
		conventions: [
			'Pattern-match first; prefer `{:ok, value}` / `{:error, reason}` tuples.',
			'snake_case for functions/variables, PascalCase for modules.',
			'Processes over threads; supervise long-lived processes.',
			'Use `with` to chain happy-path `case`/`{:ok, _}` expressions.',
			'Run `mix credo --strict` to lint and `mix format` to format.',
		],
		requiredLinterDeps: ['credo'],
		checkCommand: 'mix credo --strict',
		fixCommand: 'mix format',
		typecheckCommand: 'mix dialyzer',
	},
	{
		id: 'dart-analyze',
		framework: 'dart',
		language: 'dart',
		linter: 'dart-analyze',
		eslintConfigFile: 'dart-analyze.analysis_options.yaml',
		eslintConfigContent: `# Baseline analysis_options (the project's own analysis_options.yaml wins).
include: package:lints/recommended.yaml
linter:
  rules:
    - prefer_final_locals
    - avoid_print
`,
		conventions: [
			'Prefer value types and `final`; use `const` for compile-time constants.',
			'lowerCamelCase for members, UpperCamelCase for types.',
			'Use null-safety (`?`, `!`, `late`) deliberately; avoid force-unwrap.',
			'async/await over raw Futures; avoid blocking the event loop.',
			'Run `dart analyze` to lint and `dart format .` to format.',
		],
		requiredLinterDeps: ['dart'],
		checkCommand: 'dart analyze {target}',
		fixCommand: 'dart fix --apply {target}',
		typecheckCommand: 'dart analyze {target}',
	},
	{
		id: 'scala-scalafmt',
		framework: 'scala',
		language: 'scala',
		linter: 'scalafmt',
		eslintConfigFile: 'scala-scalafmt.scalafmt.conf',
		eslintConfigContent: `# Baseline scalafmt config (the project's own .scalafmt.conf wins).
version = "3.8.1"
runner.dialect = scala3
maxColumn = 100
`,
		conventions: [
			'Prefer immutable `val` and case classes; reserve `var` for hot loops.',
			'Model errors with `Either`/`Option`/`Try`, not exceptions, in pure code.',
			'camelCase for methods/values, PascalCase for types/objects.',
			'Use `for`-comprehensions to chain `Option`/`Either`/`Future`.',
			'Run `scalafmt` to format and `sbt compile` to type-check.',
		],
		requiredLinterDeps: ['scalafmt'],
		checkCommand: 'scalafmt --test',
		fixCommand: 'scalafmt',
		typecheckCommand: 'sbt compile',
	},
	{
		id: 'haskell-hlint',
		framework: 'haskell',
		language: 'hs',
		linter: 'hlint',
		eslintConfigFile: 'haskell-hlint.hlint.yaml',
		eslintConfigContent: `# Baseline HLint config (the project's own .hlint.yaml wins).
- warn: {name: Use explicit module export list}
- ignore: {name: Redundant do}
`,
		conventions: [
			'Purity by default; isolate effects in `IO` and keep the core total.',
			'Model absence with `Maybe`, errors with `Either`; avoid partial functions.',
			'camelCase for functions, PascalCase for types/constructors; use `newtype` liberally.',
			'Prefer property-based tests (QuickCheck/Hedgehog) for laws.',
			'Run `hlint .` to lint and `ormolu`/`fourmolu` to format.',
		],
		requiredLinterDeps: ['hlint'],
		checkCommand: 'hlint {target}',
		fixCommand: 'hlint --refactor --refactor-options=-i {target}',
		typecheckCommand: 'cabal build',
	},
	{
		id: 'zig-fmt',
		framework: 'zig',
		language: 'zig',
		linter: 'zig-fmt',
		eslintConfigFile: 'zig-fmt.README.txt',
		eslintConfigContent: `Zig has no external lint config: \`zig fmt\` is the canonical formatter and the
compiler is the type-checker. This placeholder keeps the cache layout uniform.
`,
		conventions: [
			'Handle every error explicitly with error unions (`!T`) and `try`/`catch`.',
			'Use optionals (`?T`) for absence; never a null pointer.',
			'snake_case for functions/variables, TitleCase for types.',
			'Prefer explicit allocators; free what you allocate (`defer`).',
			'Run `zig fmt --check .` to verify formatting and `zig build` to type-check.',
		],
		requiredLinterDeps: ['zig'],
		checkCommand: 'zig fmt --check {target}',
		fixCommand: 'zig fmt {target}',
		typecheckCommand: 'zig build',
	},
	{
		id: 'cpp-clang',
		framework: 'cpp',
		language: 'cpp',
		linter: 'clang-tidy',
		eslintConfigFile: 'cpp-clang.clang-tidy',
		eslintConfigContent: `# Baseline clang-tidy config (the project's own .clang-tidy wins).
Checks: 'clang-analyzer-*,modernize-*,performance-*,bugprone-*'
WarningsAsErrors: ''
`,
		conventions: [
			'Prefer RAII and smart pointers (`unique_ptr`/`shared_ptr`) over raw new/delete.',
			'Use `const`/`constexpr` aggressively; pass non-trivial types by `const&`.',
			'Follow the project naming (snake_case or CamelCase) consistently.',
			'Prefer the STL and `std::` algorithms over hand-rolled loops.',
			'Run `clang-tidy` to lint and `clang-format` to format; build to type-check.',
		],
		requiredLinterDeps: ['clang-tidy', 'clang-format'],
		checkCommand: 'clang-tidy {target}',
		fixCommand: 'clang-tidy --fix {target}',
		typecheckCommand: 'cmake --build build',
	},
];

export const RULE_PRESETS: readonly IRulePreset[] = [
	...BASE_PRESETS,
	...META_PRESETS,
	...LANGUAGE_PRESETS,
];

/** npm packages each preset's materialised ESLint config imports. */
export const REQUIRED_ESLINT_DEPS: Readonly<Record<string, readonly string[]>> =
	{
		'vanilla-js': ['@eslint/js'],
		'vanilla-ts': ['@eslint/js', 'typescript-eslint'],
		angular: ['typescript-eslint', 'angular-eslint'],
		'react-ts': [
			'@eslint/js',
			'typescript-eslint',
			'eslint-plugin-react',
			'eslint-plugin-react-hooks',
			'eslint-plugin-jsx-a11y',
		],
		'react-js': [
			'@eslint/js',
			'eslint-plugin-react',
			'eslint-plugin-react-hooks',
			'eslint-plugin-jsx-a11y',
		],
		vue: ['@eslint/js', 'eslint-plugin-vue', 'typescript-eslint'],
		svelte: ['@eslint/js', 'typescript-eslint', 'eslint-plugin-svelte'],
		jquery: ['@eslint/js', 'globals'],
		laravel: [],
		// Meta-frameworks (H6): base deps + the framework's own ESLint plugin.
		'next-ts': [
			'@eslint/js',
			'typescript-eslint',
			'eslint-plugin-react',
			'eslint-plugin-react-hooks',
			'eslint-plugin-jsx-a11y',
			'@next/eslint-plugin-next',
		],
		remix: [
			'@eslint/js',
			'typescript-eslint',
			'eslint-plugin-react',
			'eslint-plugin-react-hooks',
			'eslint-plugin-jsx-a11y',
		],
		nuxt: [
			'@eslint/js',
			'eslint-plugin-vue',
			'typescript-eslint',
			'@nuxt/eslint',
		],
		astro: ['@eslint/js', 'typescript-eslint', 'eslint-plugin-astro'],
		'solid-ts': ['@eslint/js', 'typescript-eslint', 'eslint-plugin-solid'],
		// Per-language presets (f00051 S2/S3): required binaries, not npm pkgs.
		'python-ruff': ['ruff'],
		'go-golangci': ['golangci-lint'],
		'rust-clippy': ['cargo', 'clippy'],
		'ruby-rubocop': ['rubocop'],
		'java-checkstyle': ['checkstyle'],
		'kotlin-ktlint': ['ktlint'],
		'swift-swiftlint': ['swiftlint'],
		'csharp-dotnet': ['dotnet'],
		'elixir-credo': ['credo'],
	};

export const PRESET_BY_ID: ReadonlyMap<string, IRulePreset> = new Map(
	RULE_PRESETS.map((preset) => [preset.id, preset]),
);

export const SUPPORTED_PRESET_IDS: readonly string[] = RULE_PRESETS.map(
	(preset) => preset.id,
);
