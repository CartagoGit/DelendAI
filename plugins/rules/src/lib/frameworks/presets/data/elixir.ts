import type { IRulePreset } from '../../contracts';

/**
 * Elixir (Credo) preset — DATA only.
 *
 * Single Responsibility: the baseline `.credo.exs` + bullets for
 * Elixir. The project's own `.credo.exs` layers on top and wins;
 * `mix dialyzer` is the typecheck.
 */
export const ELIXIR_PRESET: IRulePreset = {
	id: 'elixir-credo',
	framework: 'elixir',
	language: 'ex',
	linter: 'credo',
	linterConfigFile: 'elixir-credo.credo.exs',
	linterConfigContent: `# Baseline Credo config (the project's own .credo.exs wins).
%{
  configs: [
    %{
      name: "default",
      strict: true,
      checks: %{enabled: []}
    }
  ]
}
`,
	conventions: [
		'Pattern-match first; prefer `{:ok, value}` / `{:error, reason}` tuples.',
		'snake_case for functions/variables, PascalCase for modules.',
		'Processes over threads; supervise long-lived processes.',
		'Run `mix credo --strict` to lint and `mix format` to format.',
	],
	requiredLinterDeps: ['credo'],
};
