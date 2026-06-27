import type { IRulePreset } from '../../contracts';

/**
 * F# (dotnet-format) preset.
 */
export const FS_PRESET: IRulePreset = {
	id: 'fs-dotnet-format',
	framework: 'fs',
	language: 'fs',
	linter: 'dotnet-format',
	linterConfigFile: 'fs-dotnet-format.config.fs',
	linterConfigContent: `# Default dotnet-format configuration for F#\n`,
	conventions: [
		'Follow standard F# coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['dotnet-format'],
};

/**
 * Visual Basic (dotnet-format) preset.
 */
export const VB_PRESET: IRulePreset = {
	id: 'vb-dotnet-format',
	framework: 'vb',
	language: 'vb',
	linter: 'dotnet-format',
	linterConfigFile: 'vb-dotnet-format.config.vb',
	linterConfigContent: `# Default dotnet-format configuration for Visual Basic\n`,
	conventions: [
		'Follow standard Visual Basic coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['dotnet-format'],
};
