/**
 * time-budget-runner.helper.ts — the vitest runner every project loads, so no
 * test goes without a time budget and no spec can opt out.
 *
 * It measures the test body only (`runTask`): shared hooks and the import
 * of the file are not counted, and nothing is added per test beyond one
 * clock read before and one after.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { type RunnerTestCase, TestRunner } from 'vitest';

import {
	CHANGED_ENV,
	MIGRATION_ENV,
	MEASURED_META_KEY,
	MIGRATION_ROOT_ENV,
	SOFT_OVERRUN_ENV,
} from '../../contracts/constants/time-budget.constant';
import type { ITimeBudgetMigration } from '../../contracts/interfaces/time-budget.interface';
import {
	budgetFailure,
	budgetOverrun,
	mayGoUnbudgeted,
} from './time-budget.helper';

let migrating: ReadonlySet<string> | undefined;

/**
 * The real clock, taken before any test runs. A test that fakes timers
 * replaces `performance`; read through it, the body of a test that moves a
 * fake clock a minute measured a minute (59 s on CI for a 5 ms test).
 */
const realNow = performance.now.bind(performance);

/** The spec files still allowed tests with no budget, read once a worker. */
const migrationList = (): ReadonlySet<string> => {
	if (migrating !== undefined) return migrating;
	const path = process.env[MIGRATION_ENV];
	migrating = new Set(
		path === undefined
			? []
			: (JSON.parse(readFileSync(path, 'utf8')) as ITimeBudgetMigration)
					.unbudgeted,
	);
	return migrating;
};

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

const isMigrating = (test: RunnerTestCase): boolean => {
	const root = process.env[MIGRATION_ROOT_ENV];
	if (root === undefined) return false;
	return mayGoUnbudgeted(
		relative(root, test.file.filepath).split('\\').join('/'),
		migrationList(),
		changedList(),
	);
};

const overruns: string[] = [];

export default class TimeBudgetRunner extends TestRunner {
	override onAfterRunFiles(): void {
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
		Object.assign(test.meta, { [MEASURED_META_KEY]: tookMs });
		const measured = {
			name: test.name,
			migrating: isMigrating(test),
			tookMs,
			softOverrun: process.env[SOFT_OVERRUN_ENV] === '1',
		};
		const failure = budgetFailure(measured);
		if (measured.softOverrun) {
			const over = budgetOverrun(measured);
			if (over !== undefined) {
				overruns.push(`  ${test.file.name} > ${test.name}: ${over}`);
			}
		}
		if (failure !== undefined) throw new Error(failure);
	}
}
