import type { IRulePreset } from '../../contracts';

/**
 * Markdown (markdownlint) preset.
 */
export const MD_PRESET: IRulePreset = {
	id: 'md-markdownlint',
	framework: 'md',
	language: 'md',
	linter: 'markdownlint',
	linterConfigFile: 'md-markdownlint.config.md',
	linterConfigContent: `# Default markdownlint configuration for Markdown\n`,
	eslintConfigFile: 'md-markdownlint.config.md',
	eslintConfigContent: `# Default markdownlint configuration for Markdown\n`,
	conventions: [
		'Follow standard Markdown coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['markdownlint'],
};

/**
 * AsciiDoc (markdownlint) preset.
 */
export const ADOC_PRESET: IRulePreset = {
	id: 'adoc-markdownlint',
	framework: 'adoc',
	language: 'adoc',
	linter: 'markdownlint',
	linterConfigFile: 'adoc-markdownlint.config.adoc',
	linterConfigContent: `# Default markdownlint configuration for AsciiDoc\n`,
	eslintConfigFile: 'adoc-markdownlint.config.adoc',
	eslintConfigContent: `# Default markdownlint configuration for AsciiDoc\n`,
	conventions: [
		'Follow standard AsciiDoc coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['markdownlint'],
};

/**
 * reStructuredText (markdownlint) preset.
 */
export const RST_PRESET: IRulePreset = {
	id: 'rst-markdownlint',
	framework: 'rst',
	language: 'rst',
	linter: 'markdownlint',
	linterConfigFile: 'rst-markdownlint.config.rst',
	linterConfigContent: `# Default markdownlint configuration for reStructuredText\n`,
	eslintConfigFile: 'rst-markdownlint.config.rst',
	eslintConfigContent: `# Default markdownlint configuration for reStructuredText\n`,
	conventions: [
		'Follow standard reStructuredText coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['markdownlint'],
};

/**
 * LaTeX (markdownlint) preset.
 */
export const TEX_PRESET: IRulePreset = {
	id: 'tex-markdownlint',
	framework: 'tex',
	language: 'tex',
	linter: 'markdownlint',
	linterConfigFile: 'tex-markdownlint.config.tex',
	linterConfigContent: `# Default markdownlint configuration for LaTeX\n`,
	eslintConfigFile: 'tex-markdownlint.config.tex',
	eslintConfigContent: `# Default markdownlint configuration for LaTeX\n`,
	conventions: [
		'Follow standard LaTeX coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['markdownlint'],
};

/**
 * Org Mode (markdownlint) preset.
 */
export const ORG_PRESET: IRulePreset = {
	id: 'org-markdownlint',
	framework: 'org',
	language: 'org',
	linter: 'markdownlint',
	linterConfigFile: 'org-markdownlint.config.org',
	linterConfigContent: `# Default markdownlint configuration for Org Mode\n`,
	eslintConfigFile: 'org-markdownlint.config.org',
	eslintConfigContent: `# Default markdownlint configuration for Org Mode\n`,
	conventions: [
		'Follow standard Org Mode coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['markdownlint'],
};

/**
 * Typst (markdownlint) preset.
 */
export const TYPST_PRESET: IRulePreset = {
	id: 'typst-markdownlint',
	framework: 'typst',
	language: 'typst',
	linter: 'markdownlint',
	linterConfigFile: 'typst-markdownlint.config.typ',
	linterConfigContent: `# Default markdownlint configuration for Typst\n`,
	eslintConfigFile: 'typst-markdownlint.config.typ',
	eslintConfigContent: `# Default markdownlint configuration for Typst\n`,
	conventions: [
		'Follow standard Typst coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['markdownlint'],
};
