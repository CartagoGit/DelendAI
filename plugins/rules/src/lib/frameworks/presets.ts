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

export const RULE_PRESETS: readonly IRulePreset[] = [
	...BASE_PRESETS,
	...META_PRESETS,
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
	nuxt: ['@eslint/js', 'eslint-plugin-vue', 'typescript-eslint', '@nuxt/eslint'],
	astro: ['@eslint/js', 'typescript-eslint', 'eslint-plugin-astro'],
	'solid-ts': ['@eslint/js', 'typescript-eslint', 'eslint-plugin-solid'],
};

export const PRESET_BY_ID: ReadonlyMap<string, IRulePreset> = new Map(
	RULE_PRESETS.map((preset) => [preset.id, preset])
);

export const SUPPORTED_PRESET_IDS: readonly string[] = RULE_PRESETS.map(
	(preset) => preset.id
);
