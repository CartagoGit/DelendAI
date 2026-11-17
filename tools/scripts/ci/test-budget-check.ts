/**
 * test-budget-check.ts — the merge step's verdict on the budgets CI measured.
 *
 * A budget overrun fails the change only in a spec file the change touches;
 * in an untouched spec it is reported with its calibrated number and never
 * fails, so one slow sample on a file nobody edited cannot turn the
 * integration branch red. The rule is the test runner's own
 * (`isUntouchedSpec`), asked here, not copied. Every input is injected.
 */
import { isUntouchedSpec } from '../../../packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts';
import {
	budgetChanges,
	requiredCorrection,
	type ITestDurations,
} from './test-budget-calibration';

export interface ITestBudgetCheckInput {
	/** The longest time CI measured per test; throws when the reports cannot be read. */
	readonly durations: () => ITestDurations;
	/** The change's base commit; empty on a push to the integration branch. */
	readonly base: string;
	/** The files `base...HEAD` touches; throws when they cannot be listed. */
	readonly changedFiles: (base: string) => ReadonlySet<string>;
}

export interface ITestBudgetCheckVerdict {
	/** 0 when nothing the change touches is over budget. */
	readonly code: 0 | 1;
	/** Overruns in touched specs, and why the check could not run. */
	readonly errors: readonly string[];
	/** Overruns in untouched specs: reported, never failed. */
	readonly warnings: readonly string[];
}

const failed = (message: string): ITestBudgetCheckVerdict => ({
	code: 1,
	errors: [message],
	warnings: [],
});

/** Judge every measured overrun by whether the change touches its spec. */
export const checkBudgets = (
	input: ITestBudgetCheckInput,
): ITestBudgetCheckVerdict => {
	let durations: ITestDurations;
	try {
		durations = input.durations();
	} catch (error) {
		return failed(
			`test-budget-check: no readable reports: ${String(error)}`,
		);
	}
	let changed: ReadonlySet<string>;
	try {
		// No base is no change set: every spec is untouched, never all touched.
		changed =
			input.base === '' ? new Set() : input.changedFiles(input.base);
	} catch (error) {
		return failed(
			`test-budget-check: cannot list the files ${input.base} changes: ${String(error)}`,
		);
	}
	const errors: string[] = [];
	const warnings: string[] = [];
	for (const change of budgetChanges(durations)) {
		if (isUntouchedSpec(change.file, changed)) {
			warnings.push(
				`${requiredCorrection(change)} Not failed: this change does not touch the spec.`,
			);
		} else errors.push(requiredCorrection(change));
	}
	return { code: errors.length === 0 ? 0 : 1, errors, warnings };
};
