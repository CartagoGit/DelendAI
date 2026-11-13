/**
 * time-budget.helper.ts — every test says how long it may take, and the
 * run holds it to that.
 *
 * The budget sits at the front of the test name, `[<7ms] does X`, so a
 * reader, a reporter and a failure all see it with nothing injected. The
 * number is absolute: CI and a laptop judge the same test against the same
 * figure, with one stated multiplier: an e2e test's number is stretched by
 * its shard's measured load factor (1 to 4); a unit test is held to 200 ms
 * whatever its name says. It is enforced
 * on CI and calibrated from CI's own measurements (`bun run
 * test:budgets:calibrate`); anywhere else an overrun is only reported.
 */
import {
	BUDGET_INTENT,
	BUDGET_PREFIX,
	UNIT_LIMIT_MS,
} from '../../contracts/constants/time-budget.constant';
import type { ITimeBudgetCase } from '../../contracts/interfaces/time-budget.interface';

/** The budget a name carries as its prefix, if it does. */
export const budgetInName = (name: string): number | undefined => {
	const hit = BUDGET_PREFIX.exec(name);
	return hit?.[1] === undefined ? undefined : Number(hit[1]);
};

/** A file on the migration list, or one no tier is known for, is judged by its name alone, as before tiers. */
const byNameAlone = (test: ITimeBudgetCase): boolean =>
	test.migrating || test.tier === undefined;

/** Why a test fails its budget, or nothing when it keeps it. */
export const budgetFailure = (test: ITimeBudgetCase): string | undefined => {
	// A unit-tier test declares nothing the judge reads: 200 ms of real time.
	if (!byNameAlone(test) && test.tier === 'unit') {
		return test.softOverrun === true ? undefined : budgetOverrun(test);
	}
	const budget = budgetInName(test.name);
	if (budget === undefined) {
		if (test.migrating) return undefined;
		return test.name.startsWith(BUDGET_INTENT)
			? 'malformed time budget: write it at the front of the name as "[<7ms] does X" (a number, then ms, then a space).'
			: 'no time budget: start the name with its maximum, "[<7ms] does X". Every e2e test has one.';
	}
	return test.softOverrun === true || test.fresh === true
		? undefined
		: budgetOverrun(test);
};

/** How a test is over its limit, or nothing when it keeps it. */
export const budgetOverrun = (test: ITimeBudgetCase): string | undefined => {
	const load = test.loadFactor ?? 1;
	const took = test.tookMs.toFixed(1);
	if (!byNameAlone(test) && test.tier === 'unit') {
		return test.tookMs > UNIT_LIMIT_MS
			? `unit tier: took ${took} ms, over the ${String(UNIT_LIMIT_MS)} ms limit (load factor ${load.toFixed(2)}). Make the test pure, or name the spec *.e2e.spec.ts.`
			: undefined;
	}
	const budget = budgetInName(test.name);
	if (budget === undefined) return undefined;
	const limit = budget * (byNameAlone(test) ? 1 : load);
	if (test.tookMs <= limit) return undefined;
	return byNameAlone(test)
		? `took ${took} ms, over its declared budget of ${String(budget)} ms. Make the test faster; do not raise the number to fit.`
		: `e2e tier: took ${took} ms, over its declared ${String(budget)} ms x load factor ${load.toFixed(2)} = ${limit.toFixed(1)} ms. Make the test faster; do not raise the number to fit.`;
};

export { mayGoUnbudgeted } from './may-go-unbudgeted.helper';
export { freshBudgetsOfDiff } from './fresh-budget.helper';
export {
	isE2eSpec,
	loadFactorFromEnv,
	loadFactorOf,
} from './time-budget-tier.helper';
