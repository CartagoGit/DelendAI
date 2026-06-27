import type { IRulePreset } from '../../contracts';

/**
 * Jupyter Notebook (ruff) preset.
 */
export const IPYNB_PRESET: IRulePreset = {
	id: 'ipynb-ruff',
	framework: 'ipynb',
	language: 'ipynb',
	linter: 'ruff',
	linterConfigFile: 'ipynb-ruff.config.ipynb',
	linterConfigContent: `# Default ruff configuration for Jupyter Notebook\n`,
	conventions: [
		'Follow standard Jupyter Notebook coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['ruff'],
};

/**
 * R Markdown (ruff) preset.
 */
export const RMD_PRESET: IRulePreset = {
	id: 'rmd-ruff',
	framework: 'rmd',
	language: 'rmd',
	linter: 'ruff',
	linterConfigFile: 'rmd-ruff.config.rmd',
	linterConfigContent: `# Default ruff configuration for R Markdown\n`,
	conventions: [
		'Follow standard R Markdown coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['ruff'],
};

/**
 * Quarto (ruff) preset.
 */
export const QMD_PRESET: IRulePreset = {
	id: 'qmd-ruff',
	framework: 'qmd',
	language: 'qmd',
	linter: 'ruff',
	linterConfigFile: 'qmd-ruff.config.qmd',
	linterConfigContent: `# Default ruff configuration for Quarto\n`,
	conventions: [
		'Follow standard Quarto coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['ruff'],
};
