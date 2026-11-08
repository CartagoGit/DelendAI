/**
 * time-budget.helper.ts — every test says how long it may take, and the
 * run holds it to that.
 *
 * The budget is declared as test metadata, `it('does X', { meta: {
 * budgetMs: 7 } }, fn)`, and the runner writes `[<7ms] ` in front of the
 * name, so a reader and a report see it without anyone typing it twice. A
 * budget typed into the name by hand is read the same way. The number is
 * absolute: CI and a laptop judge the same test against the same figure,
 * so there is no hidden multiplier to forget about. Set it from the slower
 * of the two.
 */
import { BUDGET_PREFIX } from '../../contracts/constants/time-budget.constant';
import type { ITimeBudgetCase } from '../../contracts/interfaces/time-budget.interface';

/** The budget a name carries as its prefix, if it does. */
export const budgetInName = (name: string): number | undefined => {
	const hit = BUDGET_PREFIX.exec(name);
	return hit?.[1] === undefined ? undefined : Number(hit[1]);
};

/** The budget a test declares: its metadata first, then its name. */
export const budgetOf = (
	name: string,
	meta: { readonly budgetMs?: number },
): number | undefined => meta.budgetMs ?? budgetInName(name);

/** The name with its budget in front, once. */
export const labelled = (name: string, budgetMs: number): string =>
	BUDGET_PREFIX.test(name) ? name : `[<${String(budgetMs)}ms] ${name}`;

/** Why a test fails its budget, or nothing when it keeps it. */
export const budgetFailure = (test: ITimeBudgetCase): string | undefined => {
	const budget = budgetOf(test.name, test.meta);
	if (budget === undefined) {
		return test.migrating
			? undefined
			: `no time budget: declare one, it('…', { meta: { budgetMs: <ms> } }, fn). Every test has a maximum.`;
	}
	return test.tookMs > budget
		? `took ${test.tookMs.toFixed(1)} ms, over its declared budget of ${String(budget)} ms. Make the test faster; do not raise the number to fit.`
		: undefined;
};
