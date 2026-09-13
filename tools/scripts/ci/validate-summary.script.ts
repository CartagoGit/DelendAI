#!/usr/bin/env bun

export type ICheckResult =
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'skipped'
	| string;

export interface IValidateSummaryInput {
	readonly [job: string]: {
		readonly result?: ICheckResult;
	};
}

export interface IValidateSummaryReport {
	readonly ok: boolean;
	readonly total: number;
	readonly passed: number;
	readonly failed: readonly string[];
}

/**
 * A skip is an ANSWER when the change did not reach that zone, and a
 * SYMPTOM when something upstream went wrong — and GitHub reports both
 * with the same word. A job whose `needs` failed is `skipped` exactly
 * like a job the scope plan decided not to run.
 *
 * So the two are told apart by their company, which is the only signal
 * this input carries: a skip is honoured ONLY when nothing else failed
 * or was cancelled. Blanket-accepting `skipped` would let a masked
 * failure through as a pass, which is the one outcome a required check
 * must never produce; blanket-rejecting it makes zone scoping
 * impossible, which is what it did until now — every candidate that did
 * not touch the site or the SQLite package failed for not touching it.
 */
export const summarizeValidateChecks = (
	checks: IValidateSummaryInput,
): IValidateSummaryReport => {
	const jobs = Object.entries(checks).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const broken = jobs.filter(
		([, check]) => check.result !== 'success' && check.result !== 'skipped',
	);
	// `missing` is not a skip: a declared job that reported nothing at
	// all is a check that did not run and did not say why.
	const hardFailures = broken.map(
		([job, check]) => `${job}=${check.result ?? 'missing'}`,
	);
	const skipped = jobs.filter(([, check]) => check.result === 'skipped');

	// When something IS broken, every skip beside it becomes suspect
	// again: it may be the dependency collapse of that very failure.
	const failed =
		hardFailures.length > 0
			? [
					...hardFailures,
					...skipped.map(([job]) => `${job}=skipped(unverified)`),
				]
			: [];

	// At least one check must have actually RUN and passed. Without
	// this, a misconfigured condition that skipped every job would
	// report green having verified nothing — the same shape as #100,
	// which merged with `changed_files: 0` under a title describing a
	// twenty-two file redesign, every check green because there was
	// nothing to be red about.
	const succeeded = jobs.filter(
		([, check]) => check.result === 'success',
	).length;
	const ranNothing = succeeded === 0;

	return {
		ok: failed.length === 0 && jobs.length > 0 && !ranNothing,
		total: jobs.length,
		passed: jobs.length - failed.length,
		failed:
			ranNothing && failed.length === 0 && jobs.length > 0
				? ['(every declared check was skipped; nothing was verified)']
				: failed,
	};
};

const formatSummary = (report: IValidateSummaryReport): string => {
	const status = report.ok ? 'passed' : 'FAILED';
	const failures =
		report.failed.length > 0
			? `; failures=${report.failed.join(', ')}`
			: '';
	return `delendai-validate: ${status} (${report.passed}/${report.total} checks)${failures}`;
};

if (import.meta.main) {
	const raw = process.env.CI_NEEDS_JSON;
	if (raw === undefined) {
		console.error('delendai-validate: CI_NEEDS_JSON is required');
		process.exit(2);
	}

	try {
		const report = summarizeValidateChecks(
			JSON.parse(raw) as IValidateSummaryInput,
		);
		const output = formatSummary(report);
		if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
			await Bun.write(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
		}
		console.log(output);
		process.exit(report.ok ? 0 : 1);
	} catch (error) {
		console.error(
			`delendai-validate: invalid CI_NEEDS_JSON (${error instanceof Error ? error.message : String(error)})`,
		);
		process.exit(2);
	}
}
