#!/usr/bin/env bun

export type TRequiredRunResult =
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'skipped'
	| string;

export interface IRequiredRunInput {
	readonly [job: string]: {
		readonly result?: TRequiredRunResult;
	};
}

export interface IRequiredRunReport {
	readonly ok: boolean;
	readonly total: number;
	readonly executed: number;
	readonly missing: readonly string[];
	readonly notSuccessful: readonly string[];
	/**
	 * Jobs that were skipped ON PURPOSE, because the change could not
	 * affect their verdict.
	 *
	 * Reported separately from `executed` rather than counted as a pass:
	 * the aggregate must be able to say "this was not checked, and here
	 * is why that was the right call", which is a different sentence
	 * from "this passed".
	 */
	readonly notApplicable: readonly string[];
}

/**
 * Judge the dependency results.
 *
 * `declaredNotApplicable` is the ONLY thing that makes a `skipped` job
 * acceptable, and it comes from the scope decision the run published —
 * not from the job itself. That separation is the whole point: a job
 * cannot excuse its own absence, and a job that vanished for any other
 * reason (a failed dependency, a cancelled run, a misconfigured
 * trigger) still fails the aggregate exactly as before.
 *
 * A result that is missing entirely stays a failure in every case. It
 * is the state where a broken run and a passing run look identical.
 */
export const evaluateRequiredRuns = (
	checks: IRequiredRunInput,
	declaredNotApplicable: readonly string[] = [],
): IRequiredRunReport => {
	const jobs = Object.entries(checks).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const excused = new Set(declaredNotApplicable);
	const missing = jobs
		.filter(([, check]) => check.result === undefined)
		.map(([job]) => job);
	const notApplicable = jobs
		.filter(
			([job, check]) => check.result === 'skipped' && excused.has(job),
		)
		.map(([job]) => job);
	const excusedJobs = new Set(notApplicable);
	const notSuccessful = jobs
		.filter(
			([job, check]) =>
				check.result !== undefined &&
				check.result !== 'success' &&
				!excusedJobs.has(job),
		)
		.map(([job, check]) => `${job}=${check.result}`);

	return {
		ok:
			jobs.length > 0 &&
			missing.length === 0 &&
			notSuccessful.length === 0,
		total: jobs.length,
		executed: jobs.length - missing.length - notApplicable.length,
		missing,
		notSuccessful,
		notApplicable,
	};
};

const formatReport = (report: IRequiredRunReport): string => {
	const failures = [
		...report.missing.map((job) => `${job}=not-executed`),
		...report.notSuccessful,
	];
	const skipped =
		report.notApplicable.length > 0
			? `; not applicable to this change=${report.notApplicable.join(', ')}`
			: '';
	return `required-run-freshness: ${report.ok ? 'passed' : 'FAILED'} (${report.executed}/${report.total} executed)${skipped}${failures.length > 0 ? `; failures=${failures.join(', ')}` : ''}`;
};

if (import.meta.main) {
	const raw = process.env.CI_NEEDS_JSON;
	if (raw === undefined) {
		console.error('required-run-freshness: CI_NEEDS_JSON is required');
		process.exit(2);
	}

	try {
		const excusedRaw = process.env.CI_NOT_APPLICABLE_JSON;
		const report = evaluateRequiredRuns(
			JSON.parse(raw) as IRequiredRunInput,
			excusedRaw === undefined
				? []
				: (JSON.parse(excusedRaw) as readonly string[]),
		);
		const output = formatReport(report);
		if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
			await Bun.write(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
		}
		console.log(output);
		process.exit(report.ok ? 0 : 1);
	} catch (error) {
		console.error(
			`required-run-freshness: invalid CI_NEEDS_JSON (${error instanceof Error ? error.message : String(error)})`,
		);
		process.exit(2);
	}
}
