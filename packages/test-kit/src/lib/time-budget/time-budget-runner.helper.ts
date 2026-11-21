/**
 * time-budget-runner.helper.ts — the vitest runner every project loads, so no
 * test goes without a time budget and no spec can opt out.
 *
 * It measures the test body only (`runTask`): shared hooks and the import
 * of the file are not counted, and nothing is added per test beyond one
 * clock read before and one after.
 */
import { relative } from 'node:path';

import { type RunnerTestCase, TestRunner } from 'vitest';

import {
	CHANGED_ENV,
	FRESH_ENV,
	LOAD_BENCH_ENV,
	LOAD_FACTOR_ENV,
	LOAD_REFERENCE_ENV,
	MEASURED_LOAD_NOW_META_KEY,
	MEASURED_BENCH_META_KEY,
	MEASURED_LOAD_META_KEY,
	MEASURED_META_KEY,
	MIGRATION_ROOT_ENV,
	SOFT_OVERRUN_ENV,
} from '../../contracts/constants/time-budget.constant';
import { measureLoadBenchmark } from './load-benchmark.helper';
import {
	isE2eSpec,
	isUntouchedSpec,
	loadFactorFromEnv,
	loadFactorOf,
} from './time-budget-tier.helper';
import {
	budgetFailure,
	budgetNoise,
	budgetOverrun,
	withRemeasuredLoad,
} from './time-budget.helper';

/**
 * The real clock, taken before any test runs. A test that fakes timers
 * replaces `performance`; read through it, the body of a test that moves a
 * fake clock a minute measured a minute (59 s on CI for a 5 ms test).
 */
const realNow = performance.now.bind(performance);

let changed: ReadonlySet<string> | undefined;
let changedRead = false;

/** The spec files the change touches, read once a worker; none known is `undefined`. */
const changedList = (): ReadonlySet<string> | undefined => {
	if (changedRead) return changed;
	changedRead = true;
	const paths = process.env[CHANGED_ENV];
	changed = paths === undefined ? undefined : new Set(paths.split('\n'));
	return changed;
};

let fresh: ReadonlySet<string> | undefined;

/** The budgets the change declares or changes, read once a worker. */
const freshList = (): ReadonlySet<string> => {
	fresh ??= new Set(
		(process.env[FRESH_ENV] ?? '').split('\n').filter(Boolean),
	);
	return fresh;
};

/** The test's file, relative to the migration root, `/`-separated. */
const fileOf = (test: RunnerTestCase): string | undefined => {
	const root = process.env[MIGRATION_ROOT_ENV];
	return root === undefined
		? undefined
		: relative(root, test.file.filepath).split('\\').join('/');
};

const isFresh = (test: RunnerTestCase): boolean =>
	freshList().has(`${fileOf(test) ?? ''}\t${test.name}`);

/**
 * The tier of the test's file; none is known without the migration root. A
 * file the change does not touch is only reported: an over-limit test fails
 * the change that touches its spec file (`softOverrun`).
 */
const tierOf = (test: RunnerTestCase): 'unit' | 'e2e' | undefined => {
	const file = fileOf(test);
	if (file === undefined) return undefined;
	return isE2eSpec(file) ? 'e2e' : 'unit';
};

const untouched = (test: RunnerTestCase): boolean => {
	const file = fileOf(test);
	return file !== undefined && isUntouchedSpec(file, changedList());
};

/**
 * The load factor right now: the same benchmark, reference and clamp as the
 * shard's start. Without a reference there is nothing to divide by, and the
 * start factor stands.
 */
const loadFactorNow = (atStart: number): number => {
	const reference = Number(process.env[LOAD_REFERENCE_ENV]);
	return Number.isFinite(reference) && reference > 0
		? loadFactorOf(measureLoadBenchmark(), reference)
		: atStart;
};

const overruns: string[] = [];

const noise: string[] = [];

const freshOverruns: string[] = [];

export default class TimeBudgetRunner extends TestRunner {
	override onAfterRunFiles(): void {
		if (freshOverruns.length > 0) {
			console.warn(
				`time budget: ${String(freshOverruns.length)} budget(s) this change sets ran over on CI, which never measured them; the merge step (test:budgets:check) fails the change until each spec declares the calibrated number:\n${freshOverruns.join('\n')}`,
			);
			freshOverruns.length = 0;
		}
		if (noise.length > 0) {
			console.warn(
				`time budget: ${String(noise.length)} e2e test(s) over their stretched budget but within the noise headroom (reported, not failed):\n${noise.join('\n')}`,
			);
			noise.length = 0;
		}
		if (overruns.length === 0) return;
		console.warn(
			`time budget: ${String(overruns.length)} test(s) over their budget in a local run (budgets are enforced and calibrated in CI, so a local run only warns; CI fails it):\n${overruns.join('\n')}`,
		);
		overruns.length = 0;
	}

	async runTask(test: RunnerTestCase): Promise<void> {
		const body = TestRunner.getTestFn(test);
		const start = realNow();
		await body();
		const tookMs = realNow() - start;
		const loadFactor = loadFactorFromEnv(process.env[LOAD_FACTOR_ENV]);
		const judged = withRemeasuredLoad(
			{
				tier: tierOf(test),
				loadFactor,
				name: test.name,
				tookMs,
			},
			() => loadFactorNow(loadFactor),
		);
		Object.assign(test.meta, {
			[MEASURED_META_KEY]: tookMs,
			// The factor that applied: the calibration divides by it.
			[MEASURED_LOAD_META_KEY]: judged.loadFactor ?? loadFactor,
			[MEASURED_BENCH_META_KEY]: Number(process.env[LOAD_BENCH_ENV] ?? 0),
			...(judged.loadFactorNow === undefined
				? {}
				: { [MEASURED_LOAD_NOW_META_KEY]: judged.loadFactorNow }),
		});
		const measured = {
			tier: judged.tier,
			loadFactor: judged.loadFactor ?? loadFactor,
			loadFactorAtStart: judged.loadFactorAtStart,
			loadFactorNow: judged.loadFactorNow,
			name: test.name,
			tookMs,
			softOverrun:
				process.env[SOFT_OVERRUN_ENV] === '1' ||
				(tierOf(test) !== undefined && untouched(test)),
			fresh: isFresh(test),
		};
		const failure = budgetFailure(measured);
		if (measured.fresh && !measured.softOverrun) {
			// The change wrote this number and CI never measured it: the
			// merge step requires the calibrated one (test:budgets:check).
			const over = budgetOverrun(measured);
			if (over !== undefined) {
				freshOverruns.push(
					`  ${test.file.name} > ${test.name}: ${over}`,
				);
			}
		}
		if (measured.softOverrun) {
			const over = budgetOverrun(measured);
			if (over !== undefined) {
				overruns.push(`  ${test.file.name} > ${test.name}: ${over}`);
			}
		}
		const reported = budgetNoise(measured);
		if (reported !== undefined) {
			noise.push(`  ${test.file.name} > ${test.name}: ${reported}`);
		}
		if (failure !== undefined) throw new Error(failure);
	}
}
