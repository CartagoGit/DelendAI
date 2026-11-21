/**
 * test-budget-check.ts — the merge step's verdict on the budgets CI measured.
 *
 * A budget overrun fails the change only in a spec file the change touches;
 * in an untouched spec it is reported with its calibrated number and never
 * fails, so one slow sample on a file nobody edited cannot turn the
 * integration branch red. The rule is the test runner's own
 * (`isUntouchedSpec`), asked here, not copied. Every input is injected.
 */
import {
	isE2eSpec,
	isUntouchedSpec,
} from '../../../packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts';
import { UNIT_LIMIT_MS } from '../../../packages/test-kit/src/contracts/constants/time-budget.constant.ts';
import {
	budgetChanges,
	LOAD_ENTRY,
	requiredCorrection,
	type IBudgetChange,
	type ITestDurations,
} from './test-budget-calibration';

/** A test over its budget by more than this share is an error; up to it, a warning. */
export const ERROR_OVERRUN = 1.5;

/** The load factor up to which a shard counts as running at a normal load. */
export const NORMAL_LOAD = 1.25;

/** Warning or error: how far over its declared budget a measured time is. */
export const budgetLevel = (
	maxMs: number,
	declaredMs: number,
): 'ok' | 'warning' | 'error' => {
	if (maxMs <= declaredMs) return 'ok';
	return maxMs > declaredMs * ERROR_OVERRUN ? 'error' : 'warning';
};

export interface ITestBudgetCheckInput {
	/** The longest time CI measured per test; throws when the reports cannot be read. */
	readonly durations: () => ITestDurations;
	/** The change's base commit; empty on a push to the integration branch. */
	readonly base: string;
	/** The files `base...HEAD` touches; throws when they cannot be listed. */
	readonly changedFiles: (base: string) => ReadonlySet<string>;
	/** The load factor the run measured under; 1 (normal) when unknown. */
	readonly loadFactor?: number;
	/** A second run of the same change; an error it reproduces is real. */
	readonly rerun?: () => ITestDurations | undefined;
	/** Whether a test is on its first run (new or changed): it never blocks. */
	readonly isFirstRun?: (file: string, name: string) => boolean;
}

export interface ITestBudgetCheckVerdict {
	/** 0 when nothing the change touches is over budget. */
	readonly code: 0 | 1;
	/** Overruns in touched specs, and why the check could not run. */
	readonly errors: readonly string[];
	/** Overruns reported and never failed: warnings, noise, untouched specs, unit-tier advice. */
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
	let second: ITestDurations | undefined;
	try {
		second = input.rerun?.();
	} catch {
		// A second run that cannot be read confirms nothing.
		second = undefined;
	}
	const loaded = (input.loadFactor ?? 1) > NORMAL_LOAD;
	const reproduced = (change: IBudgetChange): boolean =>
		budgetLevel(
			second?.[change.file]?.[change.name] ?? 0,
			change.declared,
		) === 'error';
	const errors: string[] = [];
	const warnings: string[] = [];
	for (const change of budgetChanges(durations)) {
		const line = requiredCorrection(change);
		if (budgetLevel(change.maxMs, change.declared) === 'warning') {
			warnings.push(`${line} Warning: within +50% of the budget.`);
		} else if (isUntouchedSpec(change.file, changed)) {
			warnings.push(
				`${line} Not failed: this change does not touch the spec.`,
			);
		} else if (input.isFirstRun?.(change.file, change.name) === true) {
			warnings.push(`${line} Not failed: the test's first run.`);
		} else if (loaded && !reproduced(change)) {
			warnings.push(
				`${line} Not failed: a single run under load ${String(input.loadFactor)}; a second run or a normal load decides.`,
			);
		} else errors.push(line);
	}
	for (const [file, tests] of Object.entries(durations)) {
		if (file === LOAD_ENTRY || isE2eSpec(file)) continue;
		for (const [name, ms] of Object.entries(tests)) {
			if (ms > UNIT_LIMIT_MS) {
				warnings.push(
					`${file} > ${name}: unit-tier test took ${String(ms)} ms, over ${String(UNIT_LIMIT_MS)} ms. Advice only.`,
				);
			}
		}
	}
	return { code: errors.length === 0 ? 0 : 1, errors, warnings };
};
