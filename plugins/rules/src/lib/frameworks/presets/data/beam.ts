import type { IRulePreset } from '../../contracts';

/**
 * Erlang (credo) preset.
 */
export const ERL_PRESET: IRulePreset = {
	id: 'erl-credo',
	framework: 'erl',
	language: 'erl',
	linter: 'credo',
	linterConfigFile: 'erl-credo.config.erl',
	linterConfigContent: `# Default credo configuration for Erlang\n`,
	conventions: [
		'Follow standard Erlang coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['credo'],
};

/**
 * Gleam (credo) preset.
 */
export const GLEAM_PRESET: IRulePreset = {
	id: 'gleam-credo',
	framework: 'gleam',
	language: 'gleam',
	linter: 'credo',
	linterConfigFile: 'gleam-credo.config.gleam',
	linterConfigContent: `# Default credo configuration for Gleam\n`,
	conventions: [
		'Follow standard Gleam coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['credo'],
};

/**
 * LFE (credo) preset.
 */
export const LFE_PRESET: IRulePreset = {
	id: 'lfe-credo',
	framework: 'lfe',
	language: 'lfe',
	linter: 'credo',
	linterConfigFile: 'lfe-credo.config.lfe',
	linterConfigContent: `# Default credo configuration for LFE\n`,
	conventions: [
		'Follow standard LFE coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['credo'],
};
