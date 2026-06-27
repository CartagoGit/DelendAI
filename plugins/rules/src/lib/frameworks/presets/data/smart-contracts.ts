import type { IRulePreset } from '../../contracts';

/**
 * Solidity (solhint) preset.
 */
export const SOL_PRESET: IRulePreset = {
	id: 'sol-solhint',
	framework: 'sol',
	language: 'sol',
	linter: 'solhint',
	linterConfigFile: 'sol-solhint.config.sol',
	linterConfigContent: `# Default solhint configuration for Solidity\n`,
	conventions: [
		'Follow standard Solidity coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['solhint'],
};

/**
 * Move (forge) preset.
 */
export const MOVE_PRESET: IRulePreset = {
	id: 'move-forge',
	framework: 'move',
	language: 'move',
	linter: 'forge',
	linterConfigFile: 'move-forge.config.move',
	linterConfigContent: `# Default forge configuration for Move\n`,
	conventions: [
		'Follow standard Move coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['forge'],
};

/**
 * Cairo (forge) preset.
 */
export const CAIRO_PRESET: IRulePreset = {
	id: 'cairo-forge',
	framework: 'cairo',
	language: 'cairo',
	linter: 'forge',
	linterConfigFile: 'cairo-forge.config.cairo',
	linterConfigContent: `# Default forge configuration for Cairo\n`,
	conventions: [
		'Follow standard Cairo coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['forge'],
};

/**
 * Vyper (solhint) preset.
 */
export const VYPER_PRESET: IRulePreset = {
	id: 'vyper-solhint',
	framework: 'vyper',
	language: 'vyper',
	linter: 'solhint',
	linterConfigFile: 'vyper-solhint.config.vy',
	linterConfigContent: `# Default solhint configuration for Vyper\n`,
	conventions: [
		'Follow standard Vyper coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['solhint'],
};
