/**
 * time-budget.helper.ts — every test says how long it may take, and the
 * run holds it to that.
 *
 * The budget sits at the front of the test name, `[<7ms] does X`, so a
 * reader, a reporter and a failure all see it with nothing injected. The
 * number is absolute: CI and a laptop judge the same test against the same
 * figure, so there is no hidden multiplier to forget about. It is enforced
 * on CI and calibrated from CI's own measurements (`bun run
 * test:budgets:calibrate`); anywhere else an overrun is only reported.
 */
import {
	BUDGET_INTENT,
	BUDGET_PREFIX,
} from '../../contracts/constants/time-budget.constant';
import type { ITimeBudgetCase } from '../../contracts/interfaces/time-budget.interface';

/** The budget a name carries as its prefix, if it does. */
export const budgetInName = (name: string): number | undefined => {
	const hit = BUDGET_PREFIX.exec(name);
	return hit?.[1] === undefined ? undefined : Number(hit[1]);
};

/** Why a test fails its budget, or nothing when it keeps it. */
export const budgetFailure = (test: ITimeBudgetCase): string | undefined => {
	const budget = budgetInName(test.name);
	if (budget === undefined) {
		if (test.migrating) return undefined;
		return test.name.startsWith(BUDGET_INTENT)
			? 'malformed time budget: write it at the front of the name as "[<7ms] does X" (a number, then ms, then a space).'
			: 'no time budget: start the name with its maximum, "[<7ms] does X". Every test has one.';
	}
	return test.softOverrun === true ? undefined : budgetOverrun(test);
};

/** How a test is over its budget, or nothing when it keeps it. */
export const budgetOverrun = (test: ITimeBudgetCase): string | undefined => {
	const budget = budgetInName(test.name);
	return budget !== undefined && test.tookMs > budget
		? `took ${test.tookMs.toFixed(1)} ms, over its declared budget of ${String(budget)} ms. Make the test faster; do not raise the number to fit.`
		: undefined;
};

export { mayGoUnbudgeted } from './may-go-unbudgeted.helper';
