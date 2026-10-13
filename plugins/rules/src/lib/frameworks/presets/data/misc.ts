import type { IRulePreset } from '../../contracts';

/**
 * Vimscript (prettier) preset.
 */
export const VIM_PRESET: IRulePreset = {
	id: 'vim-prettier',
	framework: 'vim',
	language: 'vim',
	linter: 'prettier',
	linterConfigFile: 'vim-prettier.config.vim',
	linterConfigContent: `# Default prettier configuration for Vimscript\n`,
	eslintConfigFile: 'vim-prettier.config.vim',
	eslintConfigContent: `# Default prettier configuration for Vimscript\n`,
	conventions: [
		'Follow standard Vimscript coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['prettier'],
};

/**
 * RON (prettier) preset.
 */
export const RON_PRESET: IRulePreset = {
	id: 'ron-prettier',
	framework: 'ron',
	language: 'ron',
	linter: 'prettier',
	linterConfigFile: 'ron-prettier.config.ron',
	linterConfigContent: `# Default prettier configuration for RON\n`,
	eslintConfigFile: 'ron-prettier.config.ron',
	eslintConfigContent: `# Default prettier configuration for RON\n`,
	conventions: [
		'Follow standard RON coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['prettier'],
};
