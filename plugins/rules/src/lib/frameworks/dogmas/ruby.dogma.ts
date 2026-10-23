import type { IDogmaAdapter } from '../contracts';

/**
 * Ruby dogma (Ruby 3.3).
 *
 * Single Responsibility: the one place that declares idiomatic Ruby.
 */
export const RUBY_DOGMA: IDogmaAdapter = {
	language: 'rb',
	displayName: 'Ruby',
	version: 'ruby-3.3',
	packageManager: 'bundler',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'null',
	naming: 'snake_case',
	async: 'futures',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'spec',
	bullets: [
		'snake_case for methods/variables, CamelCase for classes/modules, SCREAMING_SNAKE for constants.',
		'Prefer guard clauses and early `return`/`next` over nested conditionals.',
		'Use `{ ... }` for single-line blocks and `do ... end` for multi-line blocks.',
		'Favour `&.` (safe navigation) over explicit `nil` checks; `freeze` string literals.',
		'Everything is an object and an expression; prefer `each`/`map`/`select` over index loops.',
		'Write specs with RSpec `describe`/`context`/`it`; run `rubocop -a` to auto-correct style.',
	],
};
