import type { IRulePreset } from '../../contracts';

/**
 * Scala (scalafmt) preset.
 */
export const SCALA_PRESET: IRulePreset = {
	id: 'scala-scalafmt',
	framework: 'scala',
	language: 'scala',
	linter: 'scalafmt',
	linterConfigFile: 'scala-scalafmt.config.scala',
	linterConfigContent: `# Default scalafmt configuration for Scala\n`,
	conventions: [
		'Follow standard Scala coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['scalafmt'],
};

/**
 * Groovy (checkstyle) preset.
 */
export const GROOVY_PRESET: IRulePreset = {
	id: 'groovy-checkstyle',
	framework: 'groovy',
	language: 'groovy',
	linter: 'checkstyle',
	linterConfigFile: 'groovy-checkstyle.config.groovy',
	linterConfigContent: `# Default checkstyle configuration for Groovy\n`,
	conventions: [
		'Follow standard Groovy coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['checkstyle'],
};

/**
 * Clojure (coq-lint) preset.
 */
export const CLOJURE_PRESET: IRulePreset = {
	id: 'clojure-coq-lint',
	framework: 'clojure',
	language: 'clojure',
	linter: 'coq-lint',
	linterConfigFile: 'clojure-coq-lint.config.clj',
	linterConfigContent: `# Default coq-lint configuration for Clojure\n`,
	conventions: [
		'Follow standard Clojure coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['coq-lint'],
};
