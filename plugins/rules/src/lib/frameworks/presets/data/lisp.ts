import type { IRulePreset } from '../../contracts';

/**
 * Clojure (coq-lint) preset.
 */
export const CLJ_PRESET: IRulePreset = {
	id: 'clj-coq-lint',
	framework: 'clj',
	language: 'clj',
	linter: 'coq-lint',
	linterConfigFile: 'clj-coq-lint.config.clj',
	linterConfigContent: `# Default coq-lint configuration for Clojure\n`,
	conventions: [
		'Follow standard Clojure coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};

/**
 * ClojureScript (coq-lint) preset.
 */
export const CLJS_PRESET: IRulePreset = {
	id: 'cljs-coq-lint',
	framework: 'cljs',
	language: 'cljs',
	linter: 'coq-lint',
	linterConfigFile: 'cljs-coq-lint.config.cljs',
	linterConfigContent: `# Default coq-lint configuration for ClojureScript\n`,
	conventions: [
		'Follow standard ClojureScript coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};

/**
 * Scheme (coq-lint) preset.
 */
export const SCM_PRESET: IRulePreset = {
	id: 'scm-coq-lint',
	framework: 'scm',
	language: 'scm',
	linter: 'coq-lint',
	linterConfigFile: 'scm-coq-lint.config.scm',
	linterConfigContent: `# Default coq-lint configuration for Scheme\n`,
	conventions: [
		'Follow standard Scheme coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};

/**
 * Racket (coq-lint) preset.
 */
export const RKT_PRESET: IRulePreset = {
	id: 'rkt-coq-lint',
	framework: 'rkt',
	language: 'rkt',
	linter: 'coq-lint',
	linterConfigFile: 'rkt-coq-lint.config.rkt',
	linterConfigContent: `# Default coq-lint configuration for Racket\n`,
	conventions: [
		'Follow standard Racket coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};

/**
 * Emacs Lisp (coq-lint) preset.
 */
export const EL_PRESET: IRulePreset = {
	id: 'el-coq-lint',
	framework: 'el',
	language: 'el',
	linter: 'coq-lint',
	linterConfigFile: 'el-coq-lint.config.el',
	linterConfigContent: `# Default coq-lint configuration for Emacs Lisp\n`,
	conventions: [
		'Follow standard Emacs Lisp coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};
