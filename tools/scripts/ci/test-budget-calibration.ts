/**
 * test-budget-calibration.ts — a test's budget comes from what CI measured
 * for it. The runner leaves each test's measured body time in its `meta`;
 * a vitest blob report carries it, and these functions read it back.
 */
import { BUDGET_PREFIX } from '../../../packages/test-kit/src/contracts/constants/time-budget.constant.ts';
import { isE2eSpec } from '../../../packages/test-kit/src/lib/time-budget/time-budget-tier.helper.ts';

/** The digest's own entry: the benchmark times shards measured, each a key and a value. */
export const LOAD_ENTRY = '@load';

/** One test's measured body time in one CI run. */
export interface IMeasuredTest {
	/** Repository-relative spec path. */
	readonly file: string;
	/** The test's own name, `[<Nms] does X`. */
	readonly name: string;
	readonly tookMs: number;
	/** The load factor of the shard that measured it; 1 when unknown. */
	readonly loadFactor?: number;
	/** The benchmark time (ms) of that shard, when it recorded one. */
	readonly benchMs?: number;
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
	readonly meta?: {
		readonly budgetTookMs?: unknown;
		readonly budgetLoadFactor?: unknown;
		readonly budgetBenchMs?: unknown;
	};
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
		const load = task.meta?.budgetLoadFactor;
		const bench = task.meta?.budgetBenchMs;
		into.push({
			file,
			name: task.name,
			tookMs,
			...(typeof load === 'number' ? { loadFactor: load } : {}),
			...(typeof bench === 'number' && bench > 0
				? { benchMs: bench }
				: {}),
		});
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

/**
 * The longest time per test over every run given (`previous` is one more
 * run), as it would have measured on a machine at the reference: each
 * time is divided by the load factor of the shard that measured it. The
 * shards' benchmark times ride along under `@load`.
 */
export const longestDurations = (
	measured: readonly IMeasuredTest[],
	previous: ITestDurations = {},
): ITestDurations => {
	const out: Record<string, Record<string, number>> = {};
	for (const [file, tests] of Object.entries(previous)) {
		out[file] = { ...tests };
	}
	for (const { file, name, tookMs, loadFactor, benchMs } of measured) {
		const tests = out[file] ?? {};
		out[file] = tests;
		const atReference = tookMs / Math.max(1, loadFactor ?? 1);
		tests[name] = Math.max(
			tests[name] ?? 0,
			Math.round(atReference * 10) / 10,
		);
		if (benchMs !== undefined) {
			const loads = out[LOAD_ENTRY] ?? {};
			out[LOAD_ENTRY] = loads;
			loads[String(benchMs)] = benchMs;
		}
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
	Object.entries(durations)
		// A unit-tier file carries no budget to correct, and `@load` is no spec.
		.filter(([file]) => file !== LOAD_ENTRY && isE2eSpec(file))
		.flatMap(([file, tests]) =>
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

/**
 * The reference benchmark time the shards of a run call for: the median of
 * what they measured; nothing when none recorded one.
 */
export const referenceOfDurations = (
	durations: ITestDurations,
): number | undefined => {
	const times = Object.values(durations[LOAD_ENTRY] ?? {}).sort(
		(a, b) => a - b,
	);
	if (times.length === 0) return undefined;
	const mid = Math.floor(times.length / 2);
	const median =
		times.length % 2 === 1
			? (times[mid] ?? 0)
			: ((times[mid - 1] ?? 0) + (times[mid] ?? 0)) / 2;
	return Math.round(median * 10) / 10;
};

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
