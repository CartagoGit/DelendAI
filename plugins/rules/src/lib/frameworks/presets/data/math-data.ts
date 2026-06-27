import type { IRulePreset } from '../../contracts';

/**
 * R (luacheck) preset.
 */
export const R_PRESET: IRulePreset = {
	id: 'r-luacheck',
	framework: 'r',
	language: 'r',
	linter: 'luacheck',
	linterConfigFile: 'r-luacheck.config.r',
	linterConfigContent: `# Default luacheck configuration for R\n`,
	conventions: [
		'Follow standard R coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['luacheck'],
};

/**
 * MATLAB (luacheck) preset.
 */
export const M_PRESET: IRulePreset = {
	id: 'm-luacheck',
	framework: 'm',
	language: 'm',
	linter: 'luacheck',
	linterConfigFile: 'm-luacheck.config.m',
	linterConfigContent: `# Default luacheck configuration for MATLAB\n`,
	conventions: [
		'Follow standard MATLAB coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['luacheck'],
};

/**
 * SAS (luacheck) preset.
 */
export const SAS_PRESET: IRulePreset = {
	id: 'sas-luacheck',
	framework: 'sas',
	language: 'sas',
	linter: 'luacheck',
	linterConfigFile: 'sas-luacheck.config.sas',
	linterConfigContent: `# Default luacheck configuration for SAS\n`,
	conventions: [
		'Follow standard SAS coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['luacheck'],
};
