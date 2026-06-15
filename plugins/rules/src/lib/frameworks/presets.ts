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
	'\t'
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
	'\t'
)}\n`;

/**
 * Default presets, one per framework+language. `eslintConfigContent` is
 * a flat-config file the project's ESLint consumes; this plugin never
 * imports those ESLint packages itself (stays dependency-light).
 */
export const RULE_PRESETS: readonly IRulePreset[] = [
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
			'\t'
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

/** npm packages each preset's materialised ESLint config imports. */
export const REQUIRED_ESLINT_DEPS: Readonly<Record<string, readonly string[]>> = {
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
};

export const PRESET_BY_ID: ReadonlyMap<string, IRulePreset> = new Map(
	RULE_PRESETS.map((preset) => [preset.id, preset])
);

export const SUPPORTED_PRESET_IDS: readonly string[] = RULE_PRESETS.map(
	(preset) => preset.id
);
