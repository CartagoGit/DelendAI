import type { IRulePreset } from '../../contracts';

/**
 * Perl (rubocop) preset.
 */
export const PL_PRESET: IRulePreset = {
	id: 'pl-rubocop',
	framework: 'pl',
	language: 'pl',
	linter: 'rubocop',
	linterConfigFile: 'pl-rubocop.config.pl',
	linterConfigContent: `# Default rubocop configuration for Perl\n`,
	conventions: [
		'Follow standard Perl coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['rubocop'],
};

/**
 * Lua (luacheck) preset.
 */
export const LUA_PRESET: IRulePreset = {
	id: 'lua-luacheck',
	framework: 'lua',
	language: 'lua',
	linter: 'luacheck',
	linterConfigFile: 'lua-luacheck.config.lua',
	linterConfigContent: `# Default luacheck configuration for Lua\n`,
	conventions: [
		'Follow standard Lua coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['luacheck'],
};

/**
 * Tcl (luacheck) preset.
 */
export const TCL_PRESET: IRulePreset = {
	id: 'tcl-luacheck',
	framework: 'tcl',
	language: 'tcl',
	linter: 'luacheck',
	linterConfigFile: 'tcl-luacheck.config.tcl',
	linterConfigContent: `# Default luacheck configuration for Tcl\n`,
	conventions: [
		'Follow standard Tcl coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['luacheck'],
};

/**
 * PHP (pint) preset.
 */
export const PHP_PRESET: IRulePreset = {
	id: 'php-pint',
	framework: 'php',
	language: 'php',
	linter: 'pint',
	linterConfigFile: 'php-pint.config.php',
	linterConfigContent: `# Default pint configuration for PHP\n`,
	conventions: [
		'Follow standard PHP coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['pint'],
};

/**
 * Julia (luacheck) preset.
 */
export const JL_PRESET: IRulePreset = {
	id: 'jl-luacheck',
	framework: 'jl',
	language: 'jl',
	linter: 'luacheck',
	linterConfigFile: 'jl-luacheck.config.jl',
	linterConfigContent: `# Default luacheck configuration for Julia\n`,
	conventions: [
		'Follow standard Julia coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['luacheck'],
};
