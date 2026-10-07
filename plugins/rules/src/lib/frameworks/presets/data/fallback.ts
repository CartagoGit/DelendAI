import type { IRulePreset } from '../../contracts';

/**
 * The vanilla-js fallback preset.
 *
 * Single Responsibility: this is the *only* preset that
 * serves as a language-agnostic "we detected nothing
 * specific" fallback. The composition root (factory)
 * includes it by default; the manifest writer resolves
 * to it when no adapter claims an area.
 *
 * Why DATA, not a hard-coded magic value: the manifest
 * writer's `presetId ?? 'vanilla-js'` fallback was a
 * leaky abstraction — it assumed a string id that no
 * registry necessarily ships. Making the fallback a
 * real `IRulePreset` (S) means:
 *   1. The factory wires it once; consumers do not.
 *   2. The manifest writer calls `registry.resolvePreset`
 *      for it, the same code path as every other preset.
 *   3. A host that wants a different fallback (e.g.
 *      "minimal-ts" or "no-lint") injects it via
 *      `buildDefaultComposition({ presets: [...] })`.
 *
 * Open/Closed: the data is here; replacing it = changing
 * one constant. No other file changes.
 */
export const VANILLA_JS_FALLBACK_PRESET: IRulePreset = {
	id: 'vanilla-js',
	framework: 'vanilla',
	language: 'js',
	linter: 'eslint',
	linterConfigFile: 'vanilla-js.eslint.config.mjs',
	linterConfigContent: `import js from '@eslint/js';

// Default base for plain JavaScript. Project config is layered on top.
export default [
	js.configs.recommended,
	{
		rules: {
			'no-var': 'error',
			'prefer-const': 'error',
			eqeqeq: ['error', 'smart'],
		},
	},
];
`,
	conventions: [
		'Use const/let, never var; strict equality (===).',
		'No unused vars; avoid leftover console.* in committed code.',
	],
	requiredLinterDeps: ['@eslint/js'],
};
