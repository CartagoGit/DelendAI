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
	MIGRATION_ROOT_ENV,
} from '../../contracts/constants/time-budget.constant';
import type { ITimeBudgetMigration } from '../../contracts/interfaces/time-budget.interface';
import { budgetFailure, mayGoUnbudgeted } from './time-budget.helper';

let migrating: ReadonlySet<string> | undefined;

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

export default class TimeBudgetRunner extends TestRunner {
	async runTask(test: RunnerTestCase): Promise<void> {
		const body = TestRunner.getTestFn(test);
		const start = performance.now();
		await body();
		const failure = budgetFailure({
			name: test.name,
			migrating: isMigrating(test),
			tookMs: performance.now() - start,
		});
		if (failure !== undefined) throw new Error(failure);
	}
}
