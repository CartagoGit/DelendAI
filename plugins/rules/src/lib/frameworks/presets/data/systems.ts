import type { IRulePreset } from '../../contracts';

/**
 * Zig (zig-fmt) preset.
 */
export const ZIG_PRESET: IRulePreset = {
	id: 'zig-zig-fmt',
	framework: 'zig',
	language: 'zig',
	linter: 'zig-fmt',
	linterConfigFile: 'zig-zig-fmt.config.zig',
	linterConfigContent: `# Default zig-fmt configuration for Zig\n`,
	eslintConfigFile: 'zig-zig-fmt.config.zig',
	eslintConfigContent: `# Default zig-fmt configuration for Zig\n`,
	conventions: [
		'Follow standard Zig coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['zig-fmt'],
};

/**
 * Nim (zig-fmt) preset.
 */
export const NIM_PRESET: IRulePreset = {
	id: 'nim-zig-fmt',
	framework: 'nim',
	language: 'nim',
	linter: 'zig-fmt',
	linterConfigFile: 'nim-zig-fmt.config.nim',
	linterConfigContent: `# Default zig-fmt configuration for Nim\n`,
	eslintConfigFile: 'nim-zig-fmt.config.nim',
	eslintConfigContent: `# Default zig-fmt configuration for Nim\n`,
	conventions: [
		'Follow standard Nim coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['zig-fmt'],
};

/**
 * Crystal (zig-fmt) preset.
 */
export const CRYSTAL_PRESET: IRulePreset = {
	id: 'crystal-zig-fmt',
	framework: 'crystal',
	language: 'crystal',
	linter: 'zig-fmt',
	linterConfigFile: 'crystal-zig-fmt.config.cr',
	linterConfigContent: `# Default zig-fmt configuration for Crystal\n`,
	eslintConfigFile: 'crystal-zig-fmt.config.cr',
	eslintConfigContent: `# Default zig-fmt configuration for Crystal\n`,
	conventions: [
		'Follow standard Crystal coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['zig-fmt'],
};

/**
 * V (zig-fmt) preset.
 */
export const V_PRESET: IRulePreset = {
	id: 'v-zig-fmt',
	framework: 'v',
	language: 'v',
	linter: 'zig-fmt',
	linterConfigFile: 'v-zig-fmt.config.v',
	linterConfigContent: `# Default zig-fmt configuration for V\n`,
	eslintConfigFile: 'v-zig-fmt.config.v',
	eslintConfigContent: `# Default zig-fmt configuration for V\n`,
	conventions: [
		'Follow standard V coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['zig-fmt'],
};

/**
 * Pony (zig-fmt) preset.
 */
export const PONY_PRESET: IRulePreset = {
	id: 'pony-zig-fmt',
	framework: 'pony',
	language: 'pony',
	linter: 'zig-fmt',
	linterConfigFile: 'pony-zig-fmt.config.pony',
	linterConfigContent: `# Default zig-fmt configuration for Pony\n`,
	eslintConfigFile: 'pony-zig-fmt.config.pony',
	eslintConfigContent: `# Default zig-fmt configuration for Pony\n`,
	conventions: [
		'Follow standard Pony coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['zig-fmt'],
};
