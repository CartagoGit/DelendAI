/** Constants for `no-interpolated-replacement.script.ts`. */

/** The sources scanned: product code and tooling, not specs. */
export const SCANNED_SOURCE =
	/^(?:packages|plugins|tools|extensions|apps)\/.*\.(?:ts|tsx|mts)$/u;

/** Specs and generated files are not where replacement strings are written. */
export const SKIPPED_SOURCE =
	/\.(?:spec|test)\.tsx?$|\.generated\.ts$|\/node_modules\//u;

/** This rule's own spec has to contain the shape it refuses. */
export const SELF_SPEC =
	'tools/scripts/lint/no-interpolated-replacement.script.spec.ts';
