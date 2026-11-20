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

/** A test's estimate: its id (`<spec> > <name>`) to milliseconds at the reference load. */
export type ITestEstimates = Readonly<Record<string, number>>;

/** The id a test's estimate is kept under: its spec and its name without the `[<Nms]` prefix. */
export const testEstimateId = (file: string, name: string): string =>
	`${file} > ${name.replace(BUDGET_PREFIX, '')}`;

/** The nearest-rank 95th percentile of `values`; nothing for none. */
export const percentile95 = (values: readonly number[]): number | undefined => {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
};

const estimatedTimes = (
	run: ITestDurations,
): readonly (readonly [string, number])[] =>
	Object.entries(run)
		.filter(([file]) => file !== LOAD_ENTRY)
		.flatMap(([file, tests]) =>
			Object.entries(tests).map(
				([name, ms]) => [testEstimateId(file, name), ms] as const,
			),
		);

/**
 * Each test's estimate: the p95 of the times the develop `runs` measured,
 * every one already taken to the reference load (see `longestDurations`),
 * so a run measured under a doubled load factor estimates the same.
 */
export const estimatesOfRuns = (
	runs: readonly ITestDurations[],
): ITestEstimates => {
	const perTest = new Map<string, number[]>();
	for (const run of runs)
		for (const [id, ms] of estimatedTimes(run))
			perTest.set(id, [...(perTest.get(id) ?? []), ms]);
	const out: Record<string, number> = {};
	for (const [id, times] of perTest)
		out[id] = Math.round((percentile95(times) ?? 0) * 10) / 10;
	return out;
};

/**
 * `existing` plus a provisional estimate, from this green run's time, for
 * every test that has none: no author edits the estimates file.
 */
export const withProvisionalEstimates = (
	existing: ITestEstimates,
	green: ITestDurations,
): ITestEstimates => {
	const out: Record<string, number> = { ...existing };
	for (const [id, ms] of estimatedTimes(green)) out[id] ??= ms;
	return out;
};

/** Whether the estimates file may be written: only on the integration branch, never a PR. */
export const mayWriteEstimates = (
	env: Readonly<Record<string, string | undefined>>,
	integrationBranch: string,
): boolean =>
	env.GITHUB_EVENT_NAME !== 'pull_request' &&
	env.GITHUB_EVENT_NAME !== 'pull_request_target' &&
	// A scheduled workflow runs on the default branch and checks develop out:
	// it names the branch it works on in ESTIMATES_BRANCH.
	(env.ESTIMATES_BRANCH ?? env.GITHUB_REF_NAME) === integrationBranch;
