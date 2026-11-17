/**
 * time-budget.helper.ts — every test says how long it may take, and the
 * run holds it to that.
 *
 * The budget sits at the front of the test name, `[<7ms] does X`, so a
 * reader, a reporter and a failure all see it with nothing injected. The
 * number is absolute: CI and a laptop judge the same test against the same
 * figure, with stated multipliers: an e2e test's number is stretched by
 * its shard's measured load factor (1 to 4), and it fails only above that
 * times a noise headroom of 2 (between the two it is reported); a unit test
 * is held to 200 ms whatever its name says. It is enforced
 * on CI and calibrated from CI's own measurements (`bun run
 * test:budgets:calibrate`); anywhere else an overrun is only reported.
 */
import {
	BUDGET_INTENT,
	E2E_NOISE_HEADROOM,
	BUDGET_PREFIX,
	UNIT_LIMIT_MS,
} from '../../contracts/constants/time-budget.constant';
import type { ITimeBudgetCase } from '../../contracts/interfaces/time-budget.interface';

/** The budget a name carries as its prefix, if it does. */
export const budgetInName = (name: string): number | undefined => {
	const hit = BUDGET_PREFIX.exec(name);
	return hit?.[1] === undefined ? undefined : Number(hit[1]);
};

/**
 * A unit file on the migration list, or a test no tier is known for, is judged
 * by its name alone, as before tiers. An e2e test with a declared budget is
 * always judged by the e2e rule, so its load factors apply and are reported.
 */
const byNameAlone = (test: ITimeBudgetCase): boolean =>
	test.tier === undefined || (test.migrating && test.tier !== 'e2e');

/** The two load factors of a re-measured test, for a message; nothing otherwise. */
const loadWords = (test: ITimeBudgetCase): string => {
	const load = test.loadFactor ?? 1;
	return test.loadFactorNow === undefined
		? `load factor ${load.toFixed(2)}`
		: `load factor ${load.toFixed(2)} (${(test.loadFactorAtStart ?? 1).toFixed(2)} at the start of the shard, ${test.loadFactorNow.toFixed(2)} measured when it ran over)`;
};

/**
 * An e2e test over `budget x` the load measured at the shard's start gets the
 * load measured again, right then: the runner's load changes during a shard,
 * so the start factor does not describe the moment the test ran. It is judged
 * against the larger of the two. Within its start budget (or any other tier)
 * nothing is measured and the case is returned as is.
 */
export const withRemeasuredLoad = (
	test: ITimeBudgetCase,
	measureFactor: () => number,
): ITimeBudgetCase => {
	if (byNameAlone(test) || test.tier !== 'e2e') return test;
	const budget = budgetInName(test.name);
	const start = test.loadFactor ?? 1;
	if (budget === undefined || test.tookMs <= budget * start) return test;
	const now = measureFactor();
	return {
		...test,
		loadFactor: Math.max(start, now),
		loadFactorAtStart: start,
		loadFactorNow: now,
	};
};

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
			? `unit tier: took ${took} ms, over the ${String(UNIT_LIMIT_MS)} ms limit (${loadWords(test)}). Make the test pure, or name the spec *.e2e.spec.ts.`
			: undefined;
	}
	const budget = budgetInName(test.name);
	if (budget === undefined) return undefined;
	if (byNameAlone(test)) {
		return test.tookMs <= budget
			? undefined
			: `took ${took} ms, over its declared budget of ${String(budget)} ms. Make the test faster; do not raise the number to fit.`;
	}
	const limit = budget * load * E2E_NOISE_HEADROOM;
	if (test.tookMs <= limit) return undefined;
	return `e2e tier: took ${took} ms, over its declared ${String(budget)} ms x ${loadWords(test)} x noise headroom ${String(E2E_NOISE_HEADROOM)} = ${limit.toFixed(1)} ms. Make the test faster; do not raise the number to fit.`;
};

/**
 * An e2e test over its stretched budget but within the noise headroom: not a
 * failure, only reported. Nothing for any other test.
 */
export const budgetNoise = (test: ITimeBudgetCase): string | undefined => {
	if (byNameAlone(test) || test.tier !== 'e2e') return undefined;
	const budget = budgetInName(test.name);
	if (budget === undefined) return undefined;
	const load = test.loadFactor ?? 1;
	const stretched = budget * load;
	// A re-measured test is reported once it passes its start budget.
	const reportedFrom = budget * (test.loadFactorAtStart ?? load);
	if (test.tookMs <= reportedFrom || budgetOverrun(test) !== undefined) {
		return undefined;
	}
	return `e2e tier: took ${test.tookMs.toFixed(1)} ms, over its start budget of ${String(budget)} ms x ${loadWords(test)} = ${stretched.toFixed(1)} ms but within the noise headroom of ${String(E2E_NOISE_HEADROOM)} (fails above ${(stretched * E2E_NOISE_HEADROOM).toFixed(1)} ms).`;
};

export { mayGoUnbudgeted } from './may-go-unbudgeted.helper';
export { freshBudgetsOfDiff } from './fresh-budget.helper';
export {
	isE2eSpec,
	isUntouchedSpec,
	loadFactorFromEnv,
	loadFactorOf,
} from './time-budget-tier.helper';
