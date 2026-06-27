import type { IRulePreset } from '../../contracts';

/**
 * HTML (htmllint) preset.
 */
export const HTML_PRESET: IRulePreset = {
	id: 'html-htmllint',
	framework: 'html',
	language: 'html',
	linter: 'htmllint',
	linterConfigFile: 'html-htmllint.config.html',
	linterConfigContent: `# Default htmllint configuration for HTML\n`,
	conventions: [
		'Follow standard HTML coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['htmllint'],
};

/**
 * CSS (stylelint) preset.
 */
export const CSS_PRESET: IRulePreset = {
	id: 'css-stylelint',
	framework: 'css',
	language: 'css',
	linter: 'stylelint',
	linterConfigFile: 'css-stylelint.config.css',
	linterConfigContent: `# Default stylelint configuration for CSS\n`,
	conventions: [
		'Follow standard CSS coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['stylelint'],
};

/**
 * SCSS (stylelint) preset.
 */
export const SCSS_PRESET: IRulePreset = {
	id: 'scss-stylelint',
	framework: 'scss',
	language: 'scss',
	linter: 'stylelint',
	linterConfigFile: 'scss-stylelint.config.scss',
	linterConfigContent: `# Default stylelint configuration for SCSS\n`,
	conventions: [
		'Follow standard SCSS coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['stylelint'],
};

/**
 * Sass (stylelint) preset.
 */
export const SASS_PRESET: IRulePreset = {
	id: 'sass-stylelint',
	framework: 'sass',
	language: 'sass',
	linter: 'stylelint',
	linterConfigFile: 'sass-stylelint.config.sass',
	linterConfigContent: `# Default stylelint configuration for Sass\n`,
	conventions: [
		'Follow standard Sass coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['stylelint'],
};

/**
 * Less (stylelint) preset.
 */
export const LESS_PRESET: IRulePreset = {
	id: 'less-stylelint',
	framework: 'less',
	language: 'less',
	linter: 'stylelint',
	linterConfigFile: 'less-stylelint.config.less',
	linterConfigContent: `# Default stylelint configuration for Less\n`,
	conventions: [
		'Follow standard Less coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['stylelint'],
};
