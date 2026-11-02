/**
 * Constants for `./candidate-disposition`.
 *
 * The checks a regeneration of the derived files can turn green. `drift`
 * compares every generated file with what `gen:all` produces;
 * `lint-presets` checks the generated preset and catalog metadata. The
 * aggregate required check fails whenever any other does, so it is never
 * evidence on its own, only company.
 */
export const REGENERATION_FIXES_CHECKS: {
	readonly drift: ReadonlySet<string>;
	readonly aggregates: ReadonlySet<string>;
} = {
	drift: new Set(['drift', 'lint-presets']),
	aggregates: new Set(['delendai-validate']),
};
