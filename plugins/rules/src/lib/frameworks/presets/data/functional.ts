import type { IRulePreset } from '../../contracts';

/**
 * Haskell (hlint) preset.
 */
export const HS_PRESET: IRulePreset = {
	id: 'hs-hlint',
	framework: 'hs',
	language: 'hs',
	linter: 'hlint',
	linterConfigFile: 'hs-hlint.config.hs',
	linterConfigContent: `# Default hlint configuration for Haskell\n`,
	eslintConfigFile: 'hs-hlint.config.hs',
	eslintConfigContent: `# Default hlint configuration for Haskell\n`,
	conventions: [
		'Follow standard Haskell coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hlint'],
};

/**
 * OCaml (hlint) preset.
 */
export const ML_PRESET: IRulePreset = {
	id: 'ml-hlint',
	framework: 'ml',
	language: 'ml',
	linter: 'hlint',
	linterConfigFile: 'ml-hlint.config.ml',
	linterConfigContent: `# Default hlint configuration for OCaml\n`,
	eslintConfigFile: 'ml-hlint.config.ml',
	eslintConfigContent: `# Default hlint configuration for OCaml\n`,
	conventions: [
		'Follow standard OCaml coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hlint'],
};

/**
 * PureScript (hlint) preset.
 */
export const PURESCRIPT_PRESET: IRulePreset = {
	id: 'purescript-hlint',
	framework: 'purescript',
	language: 'purescript',
	linter: 'hlint',
	linterConfigFile: 'purescript-hlint.config.purs',
	linterConfigContent: `# Default hlint configuration for PureScript\n`,
	eslintConfigFile: 'purescript-hlint.config.purs',
	eslintConfigContent: `# Default hlint configuration for PureScript\n`,
	conventions: [
		'Follow standard PureScript coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hlint'],
};

/**
 * Elm (elm-analyse) preset.
 */
export const ELM_PRESET: IRulePreset = {
	id: 'elm-elm-analyse',
	framework: 'elm',
	language: 'elm',
	linter: 'elm-analyse',
	linterConfigFile: 'elm-elm-analyse.config.elm',
	linterConfigContent: `# Default elm-analyse configuration for Elm\n`,
	eslintConfigFile: 'elm-elm-analyse.config.elm',
	eslintConfigContent: `# Default elm-analyse configuration for Elm\n`,
	conventions: [
		'Follow standard Elm coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['elm-analyse'],
};

/**
 * Idris (hlint) preset.
 */
export const IDRIS_PRESET: IRulePreset = {
	id: 'idris-hlint',
	framework: 'idris',
	language: 'idris',
	linter: 'hlint',
	linterConfigFile: 'idris-hlint.config.idr',
	linterConfigContent: `# Default hlint configuration for Idris\n`,
	eslintConfigFile: 'idris-hlint.config.idr',
	eslintConfigContent: `# Default hlint configuration for Idris\n`,
	conventions: [
		'Follow standard Idris coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hlint'],
};

/**
 * Agda (hlint) preset.
 */
export const AGDA_PRESET: IRulePreset = {
	id: 'agda-hlint',
	framework: 'agda',
	language: 'agda',
	linter: 'hlint',
	linterConfigFile: 'agda-hlint.config.agda',
	linterConfigContent: `# Default hlint configuration for Agda\n`,
	eslintConfigFile: 'agda-hlint.config.agda',
	eslintConfigContent: `# Default hlint configuration for Agda\n`,
	conventions: [
		'Follow standard Agda coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hlint'],
};

/**
 * Lean (hlint) preset.
 */
export const LEAN_PRESET: IRulePreset = {
	id: 'lean-hlint',
	framework: 'lean',
	language: 'lean',
	linter: 'hlint',
	linterConfigFile: 'lean-hlint.config.lean',
	linterConfigContent: `# Default hlint configuration for Lean\n`,
	eslintConfigFile: 'lean-hlint.config.lean',
	eslintConfigContent: `# Default hlint configuration for Lean\n`,
	conventions: [
		'Follow standard Lean coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hlint'],
};

/**
 * Coq (coq-lint) preset.
 */
export const COQ_PRESET: IRulePreset = {
	id: 'coq-coq-lint',
	framework: 'coq',
	language: 'coq',
	linter: 'coq-lint',
	linterConfigFile: 'coq-coq-lint.config.v',
	linterConfigContent: `# Default coq-lint configuration for Coq\n`,
	eslintConfigFile: 'coq-coq-lint.config.v',
	eslintConfigContent: `# Default coq-lint configuration for Coq\n`,
	conventions: [
		'Follow standard Coq coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};
