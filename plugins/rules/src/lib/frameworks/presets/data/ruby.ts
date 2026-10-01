import type { IRulePreset } from '../../contracts';

/**
 * Ruby (RuboCop) preset — DATA only.
 *
 * Single Responsibility: the baseline `.rubocop.yml` + bullets for
 * Ruby. The project's own `.rubocop.yml` layers on top and wins.
 */
export const RUBY_PRESET: IRulePreset = {
	id: 'ruby-rubocop',
	framework: 'ruby',
	language: 'rb',
	linter: 'rubocop',
	linterConfigFile: 'ruby-rubocop.rubocop.yml',
	linterConfigContent: `# Baseline RuboCop config (the project's own .rubocop.yml wins).
AllCops:
  NewCops: enable
  TargetRubyVersion: 3.3
`,
	conventions: [
		'snake_case for methods/variables, CamelCase for classes/modules.',
		'Prefer guard clauses; return early rather than nesting conditionals.',
		'Favour `&.` (safe navigation) over explicit nil checks.',
		'Run `rubocop` to lint and `rubocop -a` to auto-correct.',
	],
	requiredLinterDeps: ['rubocop'],
};
