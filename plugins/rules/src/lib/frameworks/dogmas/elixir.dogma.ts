import type { IDogmaAdapter } from '../contracts';

/**
 * Elixir dogma (Elixir 1.16 / OTP 26).
 *
 * Single Responsibility: the one place that declares idiomatic Elixir.
 */
export const ELIXIR_DOGMA: IDogmaAdapter = {
	language: 'ex',
	displayName: 'Elixir',
	version: 'elixir-1.16',
	packageManager: 'mix',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'snake_case',
	async: 'actors',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'example-based',
	bullets: [
		'Pattern-match first; prefer `{:ok, value}` / `{:error, reason}` tuples over raising.',
		'Data is immutable; transform with the pipe operator `|>` rather than rebinding mutable state.',
		'snake_case for functions/variables/atoms, PascalCase for modules.',
		'Processes over threads: supervise long-lived processes; "let it crash" under a supervision tree.',
		'Use `with` to chain happy-path `{:ok, _}` expressions and short-circuit on the first error.',
		'Write ExUnit tests (`test "..."`); run `mix credo --strict` to lint and `mix format` to format.',
	],
};
