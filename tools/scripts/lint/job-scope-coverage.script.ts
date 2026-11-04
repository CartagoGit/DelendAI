#!/usr/bin/env bun

/**
 * lint:job-scope — every CI job must declare what it is about.
 *
 * WHY: `job-scope.constant.ts` lets a pull request skip jobs whose
 * verdict its change cannot alter. That is only safe while the
 * declarations and the workflow agree. A job added to `ci.yml` without
 * an entry would fall through to the safe default and always run — fine
 * — but a job REMOVED from the workflow leaves a stale entry that can
 * excuse a `skipped` result for a job that no longer exists, and a
 * typo'd entry silently excuses nothing it was meant to.
 *
 * So both directions are checked, and the message says which. This lint
 * is the reason the scope table can be trusted enough to skip anything
 * at all.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import { JOB_SCOPES } from '../ci/job-scope.constant';

/** Job ids declared in a workflow file, in source order. */
export const workflowJobIds = (source: string): readonly string[] => {
	const ids: string[] = [];
	let inJobs = false;
	for (const line of source.split('\n')) {
		if (/^jobs:\s*$/u.test(line)) {
			inJobs = true;
			continue;
		}
		if (!inJobs) continue;
		// A top-level key ends the jobs block.
		if (/^\S/u.test(line) && !/^\s/u.test(line)) break;
		const match = /^ {4}([a-z][a-z0-9-]*):\s*$/u.exec(line);
		if (match?.[1] !== undefined) ids.push(match[1]);
	}
	return ids;
};

/** The two ways the table and the workflow can disagree. */
export const scopeDrift = (input: {
	readonly jobs: readonly string[];
	readonly declared: readonly string[];
}): {
	readonly undeclared: readonly string[];
	readonly stale: readonly string[];
} => ({
	undeclared: input.jobs.filter((job) => !input.declared.includes(job)),
	stale: input.declared.filter((job) => !input.jobs.includes(job)),
});

const main = (): number => {
	const source = readFileSync(
		join(repoRoot(), '.github/workflows/ci.yml'),
		'utf8',
	);
	const drift = scopeDrift({
		jobs: workflowJobIds(source),
		declared: JOB_SCOPES.map((scope) => scope.job),
	});

	if (drift.undeclared.length === 0 && drift.stale.length === 0) {
		console.log(
			`✓ job-scope: ${JOB_SCOPES.length} job(s) declared, and every job in ci.yml has an entry.`,
		);
		return 0;
	}

	if (drift.undeclared.length > 0) {
		console.error(
			`job-scope: ${drift.undeclared.join(', ')} exist(s) in ci.yml with no entry in job-scope.constant.ts. Add one — \`touches: 'always'\` is a valid answer, and the right one whenever the job's inputs are not obvious from its command line.`,
		);
	}
	if (drift.stale.length > 0) {
		console.error(
			`job-scope: ${drift.stale.join(', ')} is/are declared but no longer exist(s) in ci.yml. A stale entry can excuse a skipped job that nobody is running any more.`,
		);
	}
	return 1;
};

if (import.meta.main) process.exit(main());
