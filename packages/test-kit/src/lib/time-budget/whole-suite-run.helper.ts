/**
 * whole-suite-run.helper.ts — whether a vitest command line selects the
 * whole suite. It imports nothing but a constant, so the shared vitest
 * config (loaded without a bundler) can read it.
 */
import { WHOLE_SUITE_SPECS } from '../../contracts/constants/time-budget.constant.ts';

/** A spec file named on the command line. */
const SPEC_ARGUMENT = /\.(?:spec|test)\.[cm]?[jt]sx?$/u;

/**
 * The command line names no filter at all, or names a great many spec
 * files: the selection is the suite, not a bounded change.
 */
export const isWholeSuiteRun = (argv: readonly string[]): boolean => {
	const args = argv.slice(2);
	const specs = args.filter((arg) => SPEC_ARGUMENT.test(arg)).length;
	if (specs >= WHOLE_SUITE_SPECS) return true;
	const verb = args.findIndex((arg) => !arg.startsWith('-'));
	const filters = args
		.slice(verb + 1)
		.filter((arg) => !arg.startsWith('-')).length;
	return specs === 0 && filters === 0;
};
