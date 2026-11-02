import type { IRulePreset } from '../../contracts';

/**
 * SQL (sqlfluff) preset.
 */
export const SQL_PRESET: IRulePreset = {
	id: 'sql-sqlfluff',
	framework: 'sql',
	language: 'sql',
	linter: 'sqlfluff',
	linterConfigFile: 'sql-sqlfluff.config.sql',
	linterConfigContent: `# Default sqlfluff configuration for SQL\n`,
	eslintConfigFile: 'sql-sqlfluff.config.sql',
	eslintConfigContent: `# Default sqlfluff configuration for SQL\n`,
	conventions: [
		'Follow standard SQL coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['sqlfluff'],
};

/**
 * TOML (yamllint) preset.
 */
export const TOML_PRESET: IRulePreset = {
	id: 'toml-yamllint',
	framework: 'toml',
	language: 'toml',
	linter: 'yamllint',
	linterConfigFile: 'toml-yamllint.config.toml',
	linterConfigContent: `# Default yamllint configuration for TOML\n`,
	eslintConfigFile: 'toml-yamllint.config.toml',
	eslintConfigContent: `# Default yamllint configuration for TOML\n`,
	conventions: [
		'Follow standard TOML coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['yamllint'],
};

/**
 * YAML (yamllint) preset.
 */
export const YAML_PRESET: IRulePreset = {
	id: 'yaml-yamllint',
	framework: 'yaml',
	language: 'yaml',
	linter: 'yamllint',
	linterConfigFile: 'yaml-yamllint.config.yaml',
	linterConfigContent: `# Default yamllint configuration for YAML\n`,
	eslintConfigFile: 'yaml-yamllint.config.yaml',
	eslintConfigContent: `# Default yamllint configuration for YAML\n`,
	conventions: [
		'Follow standard YAML coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['yamllint'],
};

/**
 * JSON (jsonlint) preset.
 */
export const JSON_PRESET: IRulePreset = {
	id: 'json-jsonlint',
	framework: 'json',
	language: 'json',
	linter: 'jsonlint',
	linterConfigFile: 'json-jsonlint.config.json',
	linterConfigContent: `# Default jsonlint configuration for JSON\n`,
	eslintConfigFile: 'json-jsonlint.config.json',
	eslintConfigContent: `# Default jsonlint configuration for JSON\n`,
	conventions: [
		'Follow standard JSON coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['jsonlint'],
};

/**
 * JSON5 (jsonlint) preset.
 */
export const JSON5_PRESET: IRulePreset = {
	id: 'json5-jsonlint',
	framework: 'json5',
	language: 'json5',
	linter: 'jsonlint',
	linterConfigFile: 'json5-jsonlint.config.json5',
	linterConfigContent: `# Default jsonlint configuration for JSON5\n`,
	eslintConfigFile: 'json5-jsonlint.config.json5',
	eslintConfigContent: `# Default jsonlint configuration for JSON5\n`,
	conventions: [
		'Follow standard JSON5 coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['jsonlint'],
};

/**
 * HCL (tflint) preset.
 */
export const HCL_PRESET: IRulePreset = {
	id: 'hcl-tflint',
	framework: 'hcl',
	language: 'hcl',
	linter: 'tflint',
	linterConfigFile: 'hcl-tflint.config.hcl',
	linterConfigContent: `# Default tflint configuration for HCL\n`,
	eslintConfigFile: 'hcl-tflint.config.hcl',
	eslintConfigContent: `# Default tflint configuration for HCL\n`,
	conventions: [
		'Follow standard HCL coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['tflint'],
};

/**
 * Nix (nixfmt) preset.
 */
export const NIX_PRESET: IRulePreset = {
	id: 'nix-nixfmt',
	framework: 'nix',
	language: 'nix',
	linter: 'nixfmt',
	linterConfigFile: 'nix-nixfmt.config.nix',
	linterConfigContent: `# Default nixfmt configuration for Nix\n`,
	eslintConfigFile: 'nix-nixfmt.config.nix',
	eslintConfigContent: `# Default nixfmt configuration for Nix\n`,
	conventions: [
		'Follow standard Nix coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['nixfmt'],
};

/**
 * Dhall (nixfmt) preset.
 */
export const DHALL_PRESET: IRulePreset = {
	id: 'dhall-nixfmt',
	framework: 'dhall',
	language: 'dhall',
	linter: 'nixfmt',
	linterConfigFile: 'dhall-nixfmt.config.dhall',
	linterConfigContent: `# Default nixfmt configuration for Dhall\n`,
	eslintConfigFile: 'dhall-nixfmt.config.dhall',
	eslintConfigContent: `# Default nixfmt configuration for Dhall\n`,
	conventions: [
		'Follow standard Dhall coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['nixfmt'],
};

/**
 * CUE (nixfmt) preset.
 */
export const CUE_PRESET: IRulePreset = {
	id: 'cue-nixfmt',
	framework: 'cue',
	language: 'cue',
	linter: 'nixfmt',
	linterConfigFile: 'cue-nixfmt.config.cue',
	linterConfigContent: `# Default nixfmt configuration for CUE\n`,
	eslintConfigFile: 'cue-nixfmt.config.cue',
	eslintConfigContent: `# Default nixfmt configuration for CUE\n`,
	conventions: [
		'Follow standard CUE coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['nixfmt'],
};

/**
 * KDL (nixfmt) preset.
 */
export const KDL_PRESET: IRulePreset = {
	id: 'kdl-nixfmt',
	framework: 'kdl',
	language: 'kdl',
	linter: 'nixfmt',
	linterConfigFile: 'kdl-nixfmt.config.kdl',
	linterConfigContent: `# Default nixfmt configuration for KDL\n`,
	eslintConfigFile: 'kdl-nixfmt.config.kdl',
	eslintConfigContent: `# Default nixfmt configuration for KDL\n`,
	conventions: [
		'Follow standard KDL coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['nixfmt'],
};
