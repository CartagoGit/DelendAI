#!/usr/bin/env bun

/**
 * job-scope — decide which CI jobs a change can possibly affect.
 *
 * WHY: `develop` is green by construction — nothing reaches it except
 * through a pull request that passed. So a job whose inputs this change
 * did not touch already has a verdict, and re-running it re-establishes
 * something nobody doubted. That is most of what a pull request waits
 * for, and all of what a pull request that only FIXES a previous
 * failure waits for.
 *
 * WHAT MAKES IT SAFE: the default is to run. A job with no declaration
 * runs; a change that touches something unrecognised runs everything;
 * and `lint:job-scope` fails when a workflow job has no entry, so the
 * cost of forgetting is a slower pull request rather than an unchecked
 * one. Every bound in `job-scope.constant.ts` carries the reason it is
 * correct, because a bound without one is a guess that looks like a
 * decision.
 *
 * WHAT IT IS NOT: a way to skip a required check. A job skipped here is
 * reported to `delendai-validate` as deliberately not applicable, with
 * the scope decision alongside it, and the aggregate still refuses any
 * job that is merely absent.
 */

import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/repo-root';

import { JOB_SCOPES } from './job-scope.constant';
import type { IJobScope } from './job-scope.interface';

export { JOB_SCOPES } from './job-scope.constant';
export type { IJobScope } from './job-scope.interface';

/**
 * Whether one job has to run for this set of changed files.
 *
 * An unknown job runs. That is the whole safety property: the answer to
 * "I have never heard of this job" is never "skip it".
 */
export const jobMustRun = (input: {
	readonly job: string;
	readonly changed: readonly string[];
	readonly scopes?: readonly IJobScope[];
}): boolean => {
	const scope = (input.scopes ?? JOB_SCOPES).find(
		(each) => each.job === input.job,
	);
	if (scope === undefined) return true;
	if (scope.touches === 'always') return true;
	// A change with no files is not evidence that nothing is affected —
	// it is evidence that the diff could not be read.
	if (input.changed.length === 0) return true;
	return input.changed.some((file) =>
		(scope.touches as readonly string[]).some((prefix) =>
			file.startsWith(prefix),
		),
	);
};

/** The run/skip decision for every declared job. */
export const planJobs = (input: {
	readonly changed: readonly string[];
	readonly scopes?: readonly IJobScope[];
}): Readonly<Record<string, boolean>> =>
	Object.fromEntries(
		(input.scopes ?? JOB_SCOPES).map((scope) => [
			scope.job,
			jobMustRun({
				job: scope.job,
				changed: input.changed,
				// Spread, not `scopes: input.scopes`: under
				// `exactOptionalPropertyTypes` an explicit `undefined` is
				// not the same as an absent key, and the absent one is
				// what "use the default table" means.
				...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
			}),
		]),
	);

const changedSince = (base: string): readonly string[] => {
	try {
		return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
			cwd: repoRoot(),
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		})
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	} catch {
		// An unreadable diff must widen the run, never narrow it.
		return [];
	}
};

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

const main = (): number => {
	const base = arg('base');
	const changed = base === undefined ? [] : changedSince(base);
	const plan = planJobs({ changed });

	for (const [job, runs] of Object.entries(plan)) {
		console.log(`  ${runs ? 'run ' : 'skip'} ${job}`);
	}
	console.log(
		`job-scope: ${Object.values(plan).filter(Boolean).length}/${Object.keys(plan).length} job(s) can be affected by ${changed.length} changed file(s).`,
	);

	if (process.argv.includes('--outputs')) {
		// One JSON output rather than one per job: a workflow reading
		// `fromJSON(...)['pack-smoke']` cannot typo a job name into a
		// silently empty string the way `outputs.pack-smoke` can.
		console.log(`plan=${JSON.stringify(plan)}`);
		console.log(
			`not-applicable=${JSON.stringify(
				Object.entries(plan)
					.filter(([, runs]) => !runs)
					.map(([job]) => job),
			)}`,
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
