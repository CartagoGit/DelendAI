import type { IRulePreset } from '../../contracts';

/**
 * Shell (shellcheck) preset.
 */
export const SH_PRESET: IRulePreset = {
	id: 'sh-shellcheck',
	framework: 'sh',
	language: 'sh',
	linter: 'shellcheck',
	linterConfigFile: 'sh-shellcheck.config.sh',
	linterConfigContent: `# Default shellcheck configuration for Shell\n`,
	conventions: [
		'Follow standard Shell coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['shellcheck'],
};

/**
 * PowerShell (shellcheck) preset.
 */
export const PWSH_PRESET: IRulePreset = {
	id: 'pwsh-shellcheck',
	framework: 'pwsh',
	language: 'pwsh',
	linter: 'shellcheck',
	linterConfigFile: 'pwsh-shellcheck.config.ps1',
	linterConfigContent: `# Default shellcheck configuration for PowerShell\n`,
	conventions: [
		'Follow standard PowerShell coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['shellcheck'],
};

/**
 * Nushell (shellcheck) preset.
 */
export const NU_PRESET: IRulePreset = {
	id: 'nu-shellcheck',
	framework: 'nu',
	language: 'nu',
	linter: 'shellcheck',
	linterConfigFile: 'nu-shellcheck.config.nu',
	linterConfigContent: `# Default shellcheck configuration for Nushell\n`,
	conventions: [
		'Follow standard Nushell coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['shellcheck'],
};

/**
 * Fish (shellcheck) preset.
 */
export const FISH_PRESET: IRulePreset = {
	id: 'fish-shellcheck',
	framework: 'fish',
	language: 'fish',
	linter: 'shellcheck',
	linterConfigFile: 'fish-shellcheck.config.fish',
	linterConfigContent: `# Default shellcheck configuration for Fish\n`,
	conventions: [
		'Follow standard Fish coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['shellcheck'],
};
