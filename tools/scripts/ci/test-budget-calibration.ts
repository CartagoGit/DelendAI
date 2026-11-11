/**
 * test-budget-calibration.ts — a test's budget comes from what CI measured
 * for it. The runner leaves each test's measured body time in its `meta`;
 * a vitest blob report carries it, and these functions read it back.
 */
import { BUDGET_PREFIX } from '../../../packages/test-kit/src/contracts/constants/time-budget.constant.ts';

/** One test's measured body time in one CI run. */
export interface IMeasuredTest {
	/** Repository-relative spec path. */
	readonly file: string;
	/** The test's own name, `[<Nms] does X`. */
	readonly name: string;
	readonly tookMs: number;
}

/** Per spec file, per full test name, the longest time any run measured. */
export type ITestDurations = Readonly<
	Record<string, Readonly<Record<string, number>>>
>;

/** The budget for a test CI measured at most `maxMs`: 1.5x, at least 4 ms more. */
export const calibratedBudget = (maxMs: number): number =>
	Math.max(Math.ceil(maxMs * 1.5), Math.ceil(maxMs) + 4);

type Pool = readonly unknown[];

/** Decodes the flatted text a vitest blob is written in (root at index 0). */
export const parseFlatted = (text: string): unknown => {
	const pool = JSON.parse(text) as Pool;
	const revived = new Map<number, unknown>();
	const revive = (index: number): unknown => {
		if (revived.has(index)) return revived.get(index);
		const value = pool[index];
		if (typeof value !== 'object' || value === null) return value;
		const copy: Record<string, unknown> | unknown[] = Array.isArray(value)
			? []
			: {};
		revived.set(index, copy);
		for (const [key, child] of Object.entries(value)) {
			(copy as Record<string, unknown>)[key] =
				typeof child === 'string' ? revive(Number(child)) : child;
		}
		return copy;
	};
	return revive(0);
};

interface IBlobTask {
	readonly name?: unknown;
	readonly meta?: { readonly budgetTookMs?: unknown };
	readonly tasks?: readonly IBlobTask[];
}

interface IBlobFile extends IBlobTask {
	readonly filepath?: unknown;
}

const collect = (
	task: IBlobTask,
	file: string,
	into: IMeasuredTest[],
): void => {
	const tookMs = task.meta?.budgetTookMs;
	if (typeof task.name === 'string' && typeof tookMs === 'number') {
		into.push({ file, name: task.name, tookMs });
	}
	for (const child of task.tasks ?? []) collect(child, file, into);
};

/** Every measured test of a blob report, with its spec path from `root`. */
export const measuredTestsOfBlob = (
	text: string,
	root: string,
): readonly IMeasuredTest[] => {
	const blob = parseFlatted(text) as readonly unknown[];
	const prefix = `${root.replace(/\/+$/u, '')}/`;
	const found: IMeasuredTest[] = [];
	for (const file of (blob[1] ?? []) as readonly IBlobFile[]) {
		if (typeof file.filepath !== 'string') continue;
		const path = file.filepath.startsWith(prefix)
			? file.filepath.slice(prefix.length)
			: file.filepath;
		collect(file, path, found);
	}
	return found;
};

/** The longest time per test over every run given (`previous` is one more run). */
export const longestDurations = (
	measured: readonly IMeasuredTest[],
	previous: ITestDurations = {},
): ITestDurations => {
	const out: Record<string, Record<string, number>> = {};
	for (const [file, tests] of Object.entries(previous)) {
		out[file] = { ...tests };
	}
	for (const { file, name, tookMs } of measured) {
		const tests = out[file] ?? {};
		out[file] = tests;
		tests[name] = Math.max(tests[name] ?? 0, Math.round(tookMs * 10) / 10);
	}
	return out;
};

/** A test whose declared budget is below what CI's measurements call for. */
export interface IBudgetChange {
	readonly file: string;
	readonly name: string;
	readonly declared: number;
	readonly calibrated: number;
	readonly maxMs: number;
}

/** The tests that would fail (declared below the measured time) with their calibrated budgets. */
export const budgetChanges = (
	durations: ITestDurations,
): readonly IBudgetChange[] =>
	Object.entries(durations).flatMap(([file, tests]) =>
		Object.entries(tests).flatMap(([name, maxMs]) => {
			const declared = Number(BUDGET_PREFIX.exec(name)?.[1]);
			return Number.isFinite(declared) && maxMs > declared
				? [
						{
							file,
							name,
							declared,
							calibrated: calibratedBudget(maxMs),
							maxMs,
						},
					]
				: [];
		}),
	);

/** One line a run prints for a test CI measured over its budget, naming the number the spec must carry. */
export const requiredCorrection = (change: IBudgetChange): string =>
	`${change.file} > ${change.name}: CI measured ${String(change.maxMs)} ms; declare [<${String(change.calibrated)}ms] (bun run test:budgets:calibrate --from-ci=<this run> --update).`;

/** The spec source with the budget of `change` rewritten, if its name appears exactly once. */
export const withCalibratedBudget = (
	source: string,
	change: IBudgetChange,
): string | undefined => {
	const rest = change.name.replace(BUDGET_PREFIX, '');
	const before = `[<${String(change.declared)}ms] ${rest}`;
	const parts = source.split(before);
	return parts.length === 2
		? parts.join(`[<${String(change.calibrated)}ms] ${rest}`)
		: undefined;
};
